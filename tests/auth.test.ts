import { describe, it, expect } from 'vitest';
import { DEMO_FOUNDER_VISHNU, DEMO_FOUNDER_SRIRAM } from '../src/context/AuthContext';

describe('Founder Auth & Configuration', () => {
  it('defines valid Vishnu Vardhan founder admin identity', () => {
    expect(DEMO_FOUNDER_VISHNU.name).toBe('VISHNU VARDHAN R G');
    expect(DEMO_FOUNDER_VISHNU.email).toBe('vishnu@vsstudio.com');
    expect(DEMO_FOUNDER_VISHNU.id).toBeDefined();
  });

  it('defines valid Sriram founder admin identity', () => {
    expect(DEMO_FOUNDER_SRIRAM.name).toBe('SRIRAM S');
    expect(DEMO_FOUNDER_SRIRAM.email).toBe('sriram@vsstudio.com');
    expect(DEMO_FOUNDER_SRIRAM.id).toBeDefined();
  });
});
