import { describe, it, expect, beforeEach } from 'vitest';
import { initials, loadProfile, saveProfile } from './profile';

describe('profile', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to "You" with night mode off when nothing is stored', () => {
    expect(loadProfile()).toEqual({ name: 'You', nightMode: false });
  });

  it('round-trips a saved name', () => {
    saveProfile({ name: 'Ada Lovelace', nightMode: false });
    expect(loadProfile().name).toBe('Ada Lovelace');
  });

  it('round-trips the night-mode flag', () => {
    saveProfile({ name: 'Ada', nightMode: true });
    expect(loadProfile().nightMode).toBe(true);
  });

  it('falls back to the default for a blank stored name', () => {
    localStorage.setItem('stylus.profile.v1', JSON.stringify({ name: '   ' }));
    expect(loadProfile().name).toBe('You');
  });

  it('returns the default on corrupt JSON', () => {
    localStorage.setItem('stylus.profile.v1', '{bad');
    expect(loadProfile().name).toBe('You');
  });
});

describe('initials', () => {
  it('takes the first two letters of a single name', () => {
    expect(initials('Ada')).toBe('AD');
  });

  it('takes first + last initials of a full name', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('grace brewster hopper')).toBe('GH');
  });

  it('returns ? for an empty name', () => {
    expect(initials('   ')).toBe('?');
  });
});
