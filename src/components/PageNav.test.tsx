import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PageNav } from './PageNav';
import type { PageMeta } from '../lib/documents';

// jsdom doesn't implement scrollIntoView; PageNav calls it to keep the active
// thumb in view whenever the rail is open, which is exactly the interaction
// several tests below need to exercise.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function page(id: string, index: number): PageMeta {
  return { id, index, paper: 'notebook' };
}

const PAGES: PageMeta[] = [page('p1', 0), page('p2', 1), page('p3', 2)];

describe('PageNav', () => {
  it('renders nothing when there are no pages', () => {
    const { container } = render(
      <PageNav
        docId="d1"
        pages={[]}
        activePageId={null}
        onSelect={() => {}}
        onPrev={() => {}}
        onNext={() => {}}
        onAdd={() => {}}
        onDeleteActive={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the current page position', () => {
    render(
      <PageNav
        docId="d1"
        pages={PAGES}
        activePageId="p2"
        onSelect={() => {}}
        onPrev={() => {}}
        onNext={() => {}}
        onAdd={() => {}}
        onDeleteActive={() => {}}
      />,
    );
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  describe('jump to page', () => {
    it('clicking the count opens an editable page-number field', () => {
      render(
        <PageNav
          docId="d1"
          pages={PAGES}
          activePageId="p1"
          onSelect={() => {}}
          onPrev={() => {}}
          onNext={() => {}}
          onAdd={() => {}}
          onDeleteActive={() => {}}
        />,
      );
      fireEvent.click(screen.getByLabelText('Page 1 of 3. Click to jump to a page.'));
      expect(screen.getByLabelText('Go to page, 1 to 3')).toBeInTheDocument();
    });

    it('submitting a valid page number selects that page', () => {
      const onSelect = vi.fn();
      render(
        <PageNav
          docId="d1"
          pages={PAGES}
          activePageId="p1"
          onSelect={onSelect}
          onPrev={() => {}}
          onNext={() => {}}
          onAdd={() => {}}
          onDeleteActive={() => {}}
        />,
      );
      fireEvent.click(screen.getByLabelText('Page 1 of 3. Click to jump to a page.'));
      const input = screen.getByLabelText('Go to page, 1 to 3');
      fireEvent.change(input, { target: { value: '3' } });
      fireEvent.submit(input.closest('form')!);
      expect(onSelect).toHaveBeenCalledWith('p3');
    });

    it('ignores an out-of-range page number', () => {
      const onSelect = vi.fn();
      render(
        <PageNav
          docId="d1"
          pages={PAGES}
          activePageId="p1"
          onSelect={onSelect}
          onPrev={() => {}}
          onNext={() => {}}
          onAdd={() => {}}
          onDeleteActive={() => {}}
        />,
      );
      fireEvent.click(screen.getByLabelText('Page 1 of 3. Click to jump to a page.'));
      const input = screen.getByLabelText('Go to page, 1 to 3');
      fireEvent.change(input, { target: { value: '99' } });
      fireEvent.submit(input.closest('form')!);
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('Escape cancels editing without selecting', () => {
      const onSelect = vi.fn();
      render(
        <PageNav
          docId="d1"
          pages={PAGES}
          activePageId="p1"
          onSelect={onSelect}
          onPrev={() => {}}
          onNext={() => {}}
          onAdd={() => {}}
          onDeleteActive={() => {}}
        />,
      );
      fireEvent.click(screen.getByLabelText('Page 1 of 3. Click to jump to a page.'));
      fireEvent.keyDown(screen.getByLabelText('Go to page, 1 to 3'), { key: 'Escape' });
      expect(screen.queryByLabelText('Go to page, 1 to 3')).not.toBeInTheDocument();
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('rail toggle', () => {
    it('is a separate control from the page-count text, so jump-to-page and rail-toggle never collide', () => {
      render(
        <PageNav
          docId="d1"
          pages={PAGES}
          activePageId="p1"
          onSelect={() => {}}
          onPrev={() => {}}
          onNext={() => {}}
          onAdd={() => {}}
          onDeleteActive={() => {}}
        />,
      );
      const railToggle = screen.getByLabelText('Show page thumbnails');
      fireEvent.click(railToggle);
      expect(screen.getByLabelText('Hide page thumbnails')).toBeInTheDocument();
      // Opening the rail must not have opened the jump-to-page editor too.
      expect(screen.queryByLabelText('Go to page, 1 to 3')).not.toBeInTheDocument();
    });
  });

  describe('drag-to-reorder', () => {
    it('thumbnails are not draggable when onReorder is not provided', () => {
      render(
        <PageNav
          docId="d1"
          pages={PAGES}
          activePageId="p1"
          onSelect={() => {}}
          onPrev={() => {}}
          onNext={() => {}}
          onAdd={() => {}}
          onDeleteActive={() => {}}
        />,
      );
      fireEvent.click(screen.getByLabelText('Show page thumbnails'));
      const thumb = screen.getByLabelText('Page 1');
      expect(thumb).toHaveAttribute('draggable', 'false');
    });

    it('dragging a thumbnail onto another commits the new id order', () => {
      const onReorder = vi.fn();
      render(
        <PageNav
          docId="d1"
          pages={PAGES}
          activePageId="p1"
          onSelect={() => {}}
          onPrev={() => {}}
          onNext={() => {}}
          onAdd={() => {}}
          onDeleteActive={() => {}}
          onReorder={onReorder}
        />,
      );
      fireEvent.click(screen.getByLabelText('Show page thumbnails'));
      const first = screen.getByLabelText('Page 1'); // p1
      const third = screen.getByLabelText('Page 3'); // p3
      expect(first).toHaveAttribute('draggable', 'true');

      fireEvent.dragStart(first);
      fireEvent.dragOver(third);
      fireEvent.drop(third);

      expect(onReorder).toHaveBeenCalledWith(['p2', 'p3', 'p1']);
    });

    it('dropping a thumbnail on itself is a no-op', () => {
      const onReorder = vi.fn();
      render(
        <PageNav
          docId="d1"
          pages={PAGES}
          activePageId="p1"
          onSelect={() => {}}
          onPrev={() => {}}
          onNext={() => {}}
          onAdd={() => {}}
          onDeleteActive={() => {}}
          onReorder={onReorder}
        />,
      );
      fireEvent.click(screen.getByLabelText('Show page thumbnails'));
      const first = screen.getByLabelText('Page 1');
      fireEvent.dragStart(first);
      fireEvent.dragOver(first);
      fireEvent.drop(first);
      expect(onReorder).not.toHaveBeenCalled();
    });
  });
});
