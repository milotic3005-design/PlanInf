// @vitest-environment jsdom
/**
 * Whole-app tests in a simulated browser: accessibility (axe-core rules that
 * don't need real rendering; color contrast is checked in a real browser, see
 * README) and the key interactions.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { App } from '../App';

beforeAll(() => {
  // jsdom lacks these browser APIs; minimal stand-ins.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
});
afterEach(cleanup);

async function renderApp() {
  render(<App />);
  await screen.findByText('Show as table', {}, { timeout: 15000 }); // lazy chart chunk loaded
}

const hero = () => screen.queryByTestId('hero-net')?.textContent;

// Full-page renders plus axe take about 2 s here, and much longer on a busy machine, so these
// tests get a generous budget. The default 5 s timed out under CPU load with nothing actually wrong.
describe('app', { timeout: 30000 }, () => {
  it('has no axe accessibility violations, with every disclosure open', async () => {
    await renderApp();
    for (const b of screen.getAllByRole('button', { expanded: false })) await act(async () => fireEvent.click(b));
    const res = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } }, resultTypes: ['violations'] });
    expect(res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  it('shows the disclaimer, and every input has a label', async () => {
    await renderApp();
    expect(screen.getAllByText('Estimates for education only; not tax or medical advice.')).toHaveLength(2);
    for (const el of document.querySelectorAll('input, select')) {
      const named = (el as HTMLInputElement).labels?.length || el.getAttribute('aria-label');
      expect(named, el.outerHTML.slice(0, 80)).toBeTruthy();
    }
  });

  it('"Load the spec\'s worked example" reproduces the hand calculation', async () => {
    await renderApp();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: "Load the spec's worked example" })));
    expect(hero()).toBe('$2,183');
    const matrix = screen.getByRole('table', { name: 'Net after-tax cost per year, every scenario' });
    const row = (name: string) => within(matrix).getByRole('rowheader', { name }).closest('tr')!.textContent;
    expect(row('Sample PPO')).toMatch(/\$1,422.*\$2,352.*\$4,372/);
    expect(row('Sample HMO')).toMatch(/\$863.*\$2,183.*\$5,323/);
    expect(row('Sample HDHP')).toMatch(/−\$336.*\$2,364.*\$5,364/);
    expect(screen.getByText(/Sample HDHP is cheaper below \$2,984\.44 of care/)).toBeTruthy();
  });

  it('bad input shows an error and keeps the last good result', async () => {
    await renderApp();
    const wages = screen.getByLabelText('Your gross annual wages (W-2)');
    await act(async () => fireEvent.change(wages, { target: { value: '85k' } }));
    expect(wages.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Enter a number.')).toBeTruthy();
    expect(hero()).toBe('$2,183');
    await act(async () => fireEvent.change(wages, { target: { value: '250,000' } }));
    expect(wages.getAttribute('aria-invalid')).toBeNull();
    expect(hero()).toBe('$2,128');
  });

  it('family tier offers the spending-spread option; age 66 shows the Medicare warning', async () => {
    await renderApp();
    const tier = screen.getByRole('group', { name: 'Coverage tier' });
    await act(async () => fireEvent.click(within(tier).getByRole('radio', { name: 'Family' })));
    expect(screen.getByRole('group', { name: "How is your family's care spread?" })).toBeTruthy();
    await act(async () => fireEvent.change(screen.getByLabelText('Your age'), { target: { value: '66' } }));
    expect(screen.getByText(/you can no longer contribute to an HSA/)).toBeTruthy();
  });

  it('a plan whose deductible exceeds its out-of-pocket max is flagged under the plan table', async () => {
    await renderApp();
    await act(async () => fireEvent.change(screen.getByLabelText('Sample PPO: individual deductible'), { target: { value: '5000' } }));
    const checks = screen.getByRole('list', { name: 'Checks on your plan numbers' });
    expect(within(checks).getByText(/individual deductible \(\$5,000\.00\) is higher than the individual out-of-pocket max/)).toBeTruthy();
  });

  it('theme toggle switches light/dark for this visit without storing anything', async () => {
    await renderApp();
    const btn = screen.getByRole('button', { name: 'Switch to dark theme' });
    await act(async () => fireEvent.click(btn));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeTruthy();
    expect(localStorage.length).toBe(0);
  });

  it('loads the MultiCare 2027 plans from the template', async () => {
    await renderApp();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Load MultiCare 2027 plans' })));
    for (const name of ['MyConnected Care', 'Standard PPO', 'High Deductible PPO']) expect(screen.getByDisplayValue(name)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'More options' })));
    expect((screen.getByLabelText('Paychecks per year') as HTMLSelectElement).value).toBe('24');
    expect(screen.getByText(/Loaded from the MultiCare 2027 benefits guide/)).toBeTruthy();
    expect(screen.queryByText('SAMPLE DATA')).toBeNull();
  });

  it('HSA slider: MultiCare single, $150 a paycheck, drives the math and the HSA field', async () => {
    await renderApp();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Load MultiCare 2027 plans' })));
    const slider = screen.getByRole('slider', { name: 'Your HSA contribution per paycheck' }) as HTMLInputElement;
    expect(slider.max).toBe('155'); // $3,700 ÷ 24 = $154.17, rounded up so the last stop is the max
    expect(screen.getByTestId('hsa-net').textContent).toBe('$2,324');

    await act(async () => fireEvent.change(slider, { target: { value: '150' } }));
    expect(screen.getByTestId('hsa-per-paycheck').textContent).toBe('$150.00');
    expect(screen.getByTestId('hsa-net').textContent).toBe('$1,257');
    expect((screen.getByLabelText('HSA contribution (optional)', { exact: false }) as HTMLInputElement).value).toBe('3600');

    await act(async () => fireEvent.change(slider, { target: { value: '155' } }));
    expect(screen.getByTestId('hsa-per-paycheck').textContent).toBe('$154.17');
    expect(screen.getByTestId('hsa-net').textContent).toBe('$1,227');
    expect(screen.getByText(/MyConnected Care stays cheapest at \$3,000 of care/)).toBeTruthy();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'None' })));
    expect(screen.getByTestId('hsa-net').textContent).toBe('$2,324');
  });

  it('makes no network requests and stores nothing', async () => {
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((u: RequestInfo | URL) => {
      calls.push(String(u));
      return Promise.reject(new Error('blocked'));
    }) as typeof fetch;
    try {
      await renderApp();
      await act(async () => fireEvent.change(screen.getByLabelText('Your gross annual wages (W-2)'), { target: { value: '123456' } }));
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(calls).toEqual([]);
    expect(localStorage.length + sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });
});
