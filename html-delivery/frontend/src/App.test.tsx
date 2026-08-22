import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('Phase 14 app shell', () => {
  it('preserves every existing product route', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: '현재 갤러리 보기' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: '업로드' })).toHaveAttribute('href', '/upload.html');
    expect(screen.getByRole('link', { name: '관리자' })).toHaveAttribute('href', '/admin.html');
    expect(screen.getByRole('link', { name: /격리 뷰어/ })).toHaveAttribute('href', '/view.html');
  });

  it('labels baseline metrics as a snapshot instead of live data', () => {
    render(<App />);
    expect(screen.getAllByText('Phase 12 기준선')).toHaveLength(1);
    expect(screen.getByText('283')).toBeInTheDocument();
    expect(screen.getByText('원본과 공유 URL 보존')).toBeInTheDocument();
  });
});
