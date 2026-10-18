import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Alert, AlertDescription } from './alert';

describe('Alert', () => {
  it('interrupts a screen reader only for errors', () => {
    render(
      <>
        <Alert variant="destructive"><AlertDescription>Upload failed</AlertDescription></Alert>
        <Alert variant="warning"><AlertDescription>Plan ends soon</AlertDescription></Alert>
        <Alert variant="info"><AlertDescription>Signing in is free</AlertDescription></Alert>
      </>
    );
    expect(screen.getByRole('alert').textContent).toBe('Upload failed');
    expect(screen.getAllByRole('note').map((n) => n.textContent)).toEqual(['Plan ends soon', 'Signing in is free']);
  });
});
