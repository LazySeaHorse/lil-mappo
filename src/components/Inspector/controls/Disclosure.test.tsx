import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Disclosure } from './Disclosure';

describe('Disclosure', () => {
  it('is closed by default and does not render its content', () => {
    render(<Disclosure label="More"><p>Hidden</p></Disclosure>);
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Hidden')).toBeNull();
  });

  it('opens and closes when the user clicks the label', () => {
    render(<Disclosure label="More"><p>Hidden</p></Disclosure>);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByText('Hidden')).toBeNull();
  });
});
