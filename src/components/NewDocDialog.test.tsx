import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';
import { listDocuments } from '../lib/documents';

describe('New document mode picker', () => {
  beforeEach(() => localStorage.clear());

  function openPicker() {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'New document' }));
  }

  it('opens the mode picker instead of silently creating', () => {
    openPicker();
    expect(screen.getByRole('dialog', { name: 'New document' })).toBeInTheDocument();
    // Only the initial auto-created doc exists until a mode is chosen.
    expect(listDocuments()).toHaveLength(1);
  });

  it('creates a notebook document with mode + first page, and shows PageNav', () => {
    openPicker();
    fireEvent.click(screen.getByRole('button', { name: /Notebook/ }));
    const docs = listDocuments();
    expect(docs).toHaveLength(2);
    expect(docs[0].mode).toBe('notebook');
    // The notebook editor mounts with page navigation.
    expect(screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
  });

  it('creates a canvas document with no pagination', () => {
    openPicker();
    fireEvent.click(screen.getByRole('button', { name: /Canvas/ }));
    expect(listDocuments()[0].mode).toBe('canvas');
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
  });

  it('creates a mobile doc: bottom toolbar, no custom on-screen keyboard', () => {
    openPicker();
    fireEvent.click(screen.getByRole('button', { name: /Quick note/ }));
    expect(listDocuments()[0].mode).toBe('mobile');
    // No custom on-screen keyboard: text entry uses the active box's real
    // <textarea>, which summons the native OS keyboard on phones.
    expect(screen.queryByRole('button', { name: /Close keyboard/i })).toBeNull();
  });

  it('escape cancels without creating', () => {
    openPicker();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'New document' })).toBeNull();
    expect(listDocuments()).toHaveLength(1);
  });
});
