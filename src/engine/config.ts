/**
 * Tax-config loader and validator.
 *
 * Turns a raw tax-year JSON file (src/config/tax-years/<year>.json) into a
 * ResolvedTaxConfig of plain numbers, plus a citation (ParamRef) for every value.
 * It refuses the whole year, listing every problem, when any parameter:
 *   - has a null value (e.g. the IRS has not published it yet),
 *   - lacks a source that exists in `sources`, a pinpoint, or a userVerified flag,
 *   - has the wrong type or an out-of-range value,
 *   - or (brackets) does not reproduce the IRS-printed base amounts.
 * That last check catches transcription errors in bracket tables.
 */
import type {
  BracketRow,
  FilingStatus,
  LimitTier,
  ParamRef,
  ResolvedState,
  ResolvedStatePayrollTax,
  ResolvedTaxConfig,
  SourceInfo,
} from './types';
import { FILING_STATUSES } from './types';
import { fmtMoney, fmtPct } from './money';
import { derivedBaseAmounts } from './federal';

export class TaxConfigError extends Error {
  constructor(
    public readonly taxYear: number | undefined,
    public readonly problems: string[],
  ) {
    super(`Tax year ${taxYear ?? '(unknown)'} cannot be used:\n- ${problems.join('\n- ')}`);
    this.name = 'TaxConfigError';
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isMoney = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isRate = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1;
const isShare = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

const LIMIT_TIERS: readonly LimitTier[] = ['selfOnly', 'family'];
const BASE_AMOUNT_TOLERANCE = 0.01; // dollars

export function resolveTaxConfig(raw: unknown): ResolvedTaxConfig {
  const problems: string[] = [];
  if (!isObj(raw)) throw new TaxConfigError(undefined, ['file is not a JSON object']);

  const taxYear = Number.isInteger(raw.taxYear) ? (raw.taxYear as number) : undefined;
  if (taxYear === undefined) problems.push('taxYear must be an integer');

  // ---- sources
  const sources: Record<string, SourceInfo> = {};
  if (!isObj(raw.sources)) problems.push('missing "sources" object');
  else {
    for (const [id, s] of Object.entries(raw.sources)) {
      if (!isObj(s) || typeof s.title !== 'string' || typeof s.url !== 'string') {
        problems.push(`sources.${id}: needs at least title and url`);
        continue;
      }
      sources[id] = {
        title: s.title,
        publisher: typeof s.publisher === 'string' ? s.publisher : '',
        url: s.url,
        retrieved: typeof s.retrieved === 'string' ? s.retrieved : null,
        readBy: typeof s.readBy === 'string' ? s.readBy : '',
      };
    }
  }

  const refs: Record<string, ParamRef> = {};

  /** Validate one {value, source, pinpoint, userVerified} parameter and record its citation. */
  function param<T>(
    node: unknown,
    path: string,
    check: (v: unknown) => v is T,
    expected: string,
    display: (v: T) => string,
  ): T | undefined {
    if (!isObj(node) || !('value' in node)) {
      problems.push(`${path}: missing parameter`);
      return undefined;
    }
    if (node.value === null) {
      problems.push(`${path}: value is null (${typeof node.status === 'string' ? node.status : 'not provided'})`);
      return undefined;
    }
    let ok = true;
    if (typeof node.source !== 'string' || !(node.source in sources)) {
      problems.push(`${path}: source "${String(node.source)}" is not listed in "sources"`);
      ok = false;
    }
    if (typeof node.pinpoint !== 'string' || node.pinpoint.trim() === '') {
      problems.push(`${path}: missing pinpoint (section/table/quote in the source)`);
      ok = false;
    }
    if (!isBool(node.userVerified)) {
      problems.push(`${path}: userVerified must be true or false`);
      ok = false;
    }
    if (!check(node.value)) {
      problems.push(`${path}: expected ${expected}, got ${JSON.stringify(node.value)}`);
      return undefined;
    }
    if (ok) {
      const src = sources[node.source as string]!;
      refs[path] = {
        path,
        display: display(node.value),
        source: node.source as string,
        sourceTitle: src.title,
        url: src.url,
        pinpoint: node.pinpoint as string,
        userVerified: node.userVerified as boolean,
      };
    }
    return node.value;
  }

  const money = (node: unknown, path: string) => param(node, path, isMoney, 'a dollar amount ≥ 0', fmtMoney);
  const rate = (node: unknown, path: string) => param(node, path, isRate, 'a rate from 0 to <1', fmtPct);
  const share = (node: unknown, path: string) => param(node, path, isShare, 'a share from 0 to 1', fmtPct);
  const bool = (node: unknown, path: string) => param(node, path, isBool, 'true or false', (v) => (v ? 'yes' : 'no'));

  const get = (o: unknown, ...keys: string[]): unknown => {
    let cur: unknown = o;
    for (const k of keys) cur = isObj(cur) ? cur[k] : undefined;
    return cur;
  };

  // ---- federal
  const standardDeduction = {} as Record<FilingStatus, number>;
  const brackets = {} as Record<FilingStatus, BracketRow[]>;
  for (const fs of FILING_STATUSES) {
    standardDeduction[fs] = money(get(raw, 'federal', 'standardDeduction', fs), `federal.standardDeduction.${fs}`) ?? NaN;

    const bpath = `federal.brackets.${fs}`;
    const bnode = get(raw, 'federal', 'brackets', fs);
    const rows = param(bnode, bpath, isBracketRows, 'bracket rows starting at over: 0, ascending, rates 0–<1', fmtBrackets);
    if (rows) {
      const printed = get(bnode, 'printedBaseAmounts');
      if (!Array.isArray(printed) || printed.length !== rows.length - 1 || !printed.every(isMoney)) {
        problems.push(`${bpath}: printedBaseAmounts must list the IRS "$N plus" amount for each row after the first`);
      } else {
        const derived = derivedBaseAmounts(rows);
        derived.forEach((d, i) => {
          if (Math.abs(d - (printed[i] as number)) > BASE_AMOUNT_TOLERANCE) {
            problems.push(
              `${bpath}: row ${i + 2} base amount computed from the brackets is ${d.toFixed(2)}, but the IRS prints ${(printed[i] as number).toFixed(2)}. Check the transcription.`,
            );
          }
        });
      }
      brackets[fs] = rows;
    }
  }
  const addl = get(raw, 'federal', 'additionalStandardDeductionAge65OrBlind');
  const additionalStandardDeductionAge65OrBlind = {
    married: money(get(addl, 'married'), 'federal.additionalStandardDeductionAge65OrBlind.married') ?? NaN,
    unmarried: money(get(addl, 'unmarried'), 'federal.additionalStandardDeductionAge65OrBlind.unmarried') ?? NaN,
  };

  // ---- FICA
  const f = get(raw, 'fica');
  const additionalMedicareThreshold = {} as Record<FilingStatus, number>;
  for (const fs of FILING_STATUSES) {
    additionalMedicareThreshold[fs] =
      money(get(f, 'additionalMedicareThreshold', fs), `fica.additionalMedicareThreshold.${fs}`) ?? NaN;
  }
  const fica = {
    socialSecurityRate: rate(get(f, 'socialSecurityRate'), 'fica.socialSecurityRate') ?? NaN,
    socialSecurityWageBase: money(get(f, 'socialSecurityWageBase'), 'fica.socialSecurityWageBase') ?? NaN,
    medicareRate: rate(get(f, 'medicareRate'), 'fica.medicareRate') ?? NaN,
    additionalMedicareRate: rate(get(f, 'additionalMedicareRate'), 'fica.additionalMedicareRate') ?? NaN,
    additionalMedicareThreshold,
    section125ExcludedFromFicaWages:
      bool(get(f, 'section125ExcludedFromFicaWages'), 'fica.section125ExcludedFromFicaWages') ?? false,
  };

  // ---- HSA
  const h = get(raw, 'hsa');
  const byTier = (key: string) => {
    const out = {} as Record<LimitTier, number>;
    for (const t of LIMIT_TIERS) out[t] = money(get(h, key, t), `hsa.${key}.${t}`) ?? NaN;
    return out;
  };
  const hsa = {
    contributionLimit: byTier('contributionLimit'),
    catchUpAge55: money(get(h, 'catchUpAge55'), 'hsa.catchUpAge55') ?? NaN,
    hdhpMinDeductible: byTier('hdhpMinDeductible'),
    hdhpMaxOutOfPocket: byTier('hdhpMaxOutOfPocket'),
  };

  // ---- Health FSA
  const healthFsa = {
    salaryReductionLimit: money(get(raw, 'healthFsa', 'salaryReductionLimit'), 'healthFsa.salaryReductionLimit') ?? NaN,
    maxCarryover: money(get(raw, 'healthFsa', 'maxCarryover'), 'healthFsa.maxCarryover') ?? NaN,
  };

  // ---- States
  const states: Record<string, ResolvedState> = {};
  const rawStates = get(raw, 'states');
  if (!isObj(rawStates)) problems.push('missing "states" object');
  else {
    for (const [key, s] of Object.entries(rawStates)) {
      const base = `states.${key}`;
      if (key === 'CUSTOM') problems.push(`${base}: "CUSTOM" is reserved for the custom-state option`);
      const type = param(
        get(s, 'incomeTax', 'type'),
        `${base}.incomeTax.type`,
        (v): v is 'none' => v === 'none',
        '"none" (state bracket tables are not supported in v1; use the custom-state option)',
        (v) => v,
      );
      const payrollTaxes: ResolvedStatePayrollTax[] = [];
      const list = get(s, 'payrollTaxes');
      if (list !== undefined && !Array.isArray(list)) problems.push(`${base}.payrollTaxes must be an array`);
      (Array.isArray(list) ? list : []).forEach((pt, i) => {
        const p = `${base}.payrollTaxes[${i}]`;
        const id = get(pt, 'id');
        const name = get(pt, 'name');
        if (typeof id !== 'string' || typeof name !== 'string') problems.push(`${p}: needs id and name`);
        // For wageCap only, a null value means "no cap" (not "unpublished").
        const capNode = get(pt, 'wageCap');
        const capIsNone = isObj(capNode) && capNode.value === null;
        const cap = capIsNone
          ? noCapRef(capNode, `${p}.wageCap`)
          : param(
              capNode,
              `${p}.wageCap`,
              (v): v is number | 'socialSecurityWageBase' => v === 'socialSecurityWageBase' || isMoney(v),
              'a dollar amount, "socialSecurityWageBase", or null for no cap',
              (v) => (v === 'socialSecurityWageBase' ? 'Social Security wage base' : fmtMoney(v)),
            );
        payrollTaxes.push({
          id: String(id),
          name: String(name),
          totalRate: rate(get(pt, 'totalRate'), `${p}.totalRate`) ?? NaN,
          employeeShare: share(get(pt, 'employeeShare'), `${p}.employeeShare`) ?? NaN,
          wageCap: capIsNone ? null : cap === 'socialSecurityWageBase' ? fica.socialSecurityWageBase : (cap ?? NaN),
          reducedBySection125: bool(get(pt, 'reducedBySection125'), `${p}.reducedBySection125`) ?? false,
        });
      });
      states[key] = {
        key,
        name: typeof get(s, 'name') === 'string' ? (get(s, 'name') as string) : key,
        incomeTax: type ?? 'none',
        payrollTaxes,
      };
    }
  }

  /** Record the citation for a wageCap whose null value means "no cap". Returns undefined (no cap). */
  function noCapRef(node: Obj, path: string): undefined {
    if (typeof node.source === 'string' && node.source in sources && typeof node.pinpoint === 'string' && isBool(node.userVerified)) {
      const src = sources[node.source]!;
      refs[path] = {
        path,
        display: 'no cap',
        source: node.source,
        sourceTitle: src.title,
        url: src.url,
        pinpoint: node.pinpoint,
        userVerified: node.userVerified === true,
      };
    } else problems.push(`${path}: needs source and pinpoint`);
  }

  if (problems.length > 0) throw new TaxConfigError(taxYear, problems);

  return {
    taxYear: taxYear!,
    federal: { standardDeduction, additionalStandardDeductionAge65OrBlind, brackets },
    fica,
    hsa,
    healthFsa,
    states,
    sources,
    refs,
  };
}

/** Config paths whose userVerified flag is still false. */
export function unverifiedParams(cfg: ResolvedTaxConfig): string[] {
  return Object.values(cfg.refs)
    .filter((r) => !r.userVerified)
    .map((r) => r.path);
}

/** Look up citations by path, skipping any that don't exist (e.g. optional state taxes). */
export function refsFor(cfg: ResolvedTaxConfig, ...paths: string[]): ParamRef[] {
  return paths.map((p) => cfg.refs[p]).filter((r): r is ParamRef => r !== undefined);
}

function isBracketRows(v: unknown): v is BracketRow[] {
  if (!Array.isArray(v) || v.length === 0) return false;
  let prev = -Infinity;
  for (const [i, row] of v.entries()) {
    if (!isObj(row) || !isMoney(row.over) || !isRate(row.rate)) return false;
    if (i === 0 && row.over !== 0) return false;
    if (row.over <= prev) return false;
    prev = row.over;
  }
  return true;
}

function fmtBrackets(rows: BracketRow[]): string {
  return rows.map((r) => `${fmtPct(r.rate)} over ${fmtMoney(r.over).replace('.00', '')}`).join('; ');
}
