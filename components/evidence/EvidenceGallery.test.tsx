import { screen, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EvidenceGallery, type GalleryItem } from './EvidenceGallery';
import { renderIntl } from '@/tests/render';

const mockItems: GalleryItem[] = [
  {
    id: 'item-1',
    name: 'goods_arrival.jpg',
    type: 'image',
    previewUrl: 'blob:preview-1',
  },
  {
    id: 'item-2',
    name: 'receipt_closeup.jpg',
    type: 'image',
    previewUrl: 'blob:preview-2',
  },
  {
    id: 'item-3',
    name: 'unloading.mp4',
    type: 'video',
    previewUrl: 'blob:preview-3',
  },
];

describe('EvidenceGallery (#114)', () => {
  it('renders thumbnails with accessible names based on position and filename', () => {
    renderIntl(<EvidenceGallery items={mockItems} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveAttribute(
      'aria-label',
      'Evidence 1 of 3: goods_arrival.jpg',
    );
    expect(buttons[1]).toHaveAttribute(
      'aria-label',
      'Evidence 2 of 3: receipt_closeup.jpg',
    );
    expect(buttons[2]).toHaveAttribute(
      'aria-label',
      'Evidence 3 of 3: unloading.mp4',
    );
  });

  it('opens full-screen viewer, navigates with next, previous, and closes', () => {
    renderIntl(<EvidenceGallery items={mockItems} />);

    // Click first thumbnail to open
    const thumb1 = screen.getByRole('button', { name: /evidence 1 of 3: goods_arrival\.jpg/i });
    fireEvent.click(thumb1);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText(/evidence 1 of 3: goods_arrival\.jpg/i)).toBeInTheDocument();

    // Next button
    const nextBtn = screen.getByRole('button', { name: /next evidence/i });
    fireEvent.click(nextBtn);
    expect(screen.getByText(/evidence 2 of 3: receipt_closeup\.jpg/i)).toBeInTheDocument();

    // Next button again (video item)
    fireEvent.click(nextBtn);
    expect(screen.getByText(/evidence 3 of 3: unloading\.mp4/i)).toBeInTheDocument();
    expect(document.querySelector('video')).toBeInTheDocument();

    // Previous button
    const prevBtn = screen.getByRole('button', { name: /previous evidence/i });
    fireEvent.click(prevBtn);
    expect(screen.getByText(/evidence 2 of 3: receipt_closeup\.jpg/i)).toBeInTheDocument();

    // Close button
    const closeBtn = screen.getByRole('button', { name: /close evidence preview/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('supports keyboard navigation: ArrowRight, ArrowLeft, and Escape to close', () => {
    renderIntl(<EvidenceGallery items={mockItems} />);

    const thumb1 = screen.getByRole('button', { name: /evidence 1 of 3/i });
    fireEvent.click(thumb1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // ArrowRight
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText(/evidence 2 of 3/i)).toBeInTheDocument();

    // ArrowLeft
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText(/evidence 1 of 3/i)).toBeInTheDocument();

    // Escape closes dialog
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('deleting an unsubmitted item removes it and updates the viewer', () => {
    const onDelete = vi.fn();
    const { rerender } = renderIntl(
      <EvidenceGallery items={mockItems} isSubmitted={false} onDelete={onDelete} />,
    );

    // Open item 2
    fireEvent.click(screen.getByRole('button', { name: /evidence 2 of 3/i }));

    // Click Delete in viewer
    const deleteBtn = screen.getByRole('button', { name: /delete receipt_closeup\.jpg/i });
    fireEvent.click(deleteBtn);

    // Click Confirm delete
    const confirmBtn = screen.getByRole('button', { name: /^delete$/i });
    fireEvent.click(confirmBtn);

    expect(onDelete).toHaveBeenCalledWith(mockItems[1]);

    // Rerender with remaining items
    const remaining = [mockItems[0]!, mockItems[2]!];
    rerender(<EvidenceGallery items={remaining} isSubmitted={false} onDelete={onDelete} />);

    // Viewer now displays 2 items and updates current index
    expect(screen.getByText(/evidence 2 of 2: unloading\.mp4/i)).toBeInTheDocument();
  });

  it('does NOT offer deletion for submitted items', () => {
    renderIntl(<EvidenceGallery items={mockItems} isSubmitted={true} />);

    // Open viewer
    fireEvent.click(screen.getByRole('button', { name: /evidence 1 of 3/i }));

    // Delete control should not exist
    expect(screen.queryByRole('button', { name: /^delete/i })).toBeNull();
    expect(screen.getByText('Cannot delete submitted evidence')).toBeInTheDocument();
  });

  it('deleting the only remaining item closes the viewer', () => {
    const singleItem = [mockItems[0]!];
    const onDelete = vi.fn();
    const { rerender } = renderIntl(
      <EvidenceGallery items={singleItem} isSubmitted={false} onDelete={onDelete} />,
    );

    // Open viewer
    fireEvent.click(screen.getByRole('button', { name: /evidence 1 of 1/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Delete
    fireEvent.click(screen.getByRole('button', { name: /delete goods_arrival\.jpg/i }));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(onDelete).toHaveBeenCalledWith(singleItem[0]);

    // Rerender empty
    rerender(<EvidenceGallery items={[]} isSubmitted={false} onDelete={onDelete} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('No evidence items yet.')).toBeInTheDocument();
  });

  it('cancels in-flight upload when item is deleted', () => {
    const onCancelUpload = vi.fn();
    const inFlightItem: GalleryItem = {
      id: 'uploading-1',
      name: 'big_photo.jpg',
      previewUrl: 'blob:big',
      isUploading: true,
      onCancelUpload,
    };

    const onDelete = vi.fn();
    renderIntl(
      <EvidenceGallery
        items={[inFlightItem]}
        isSubmitted={false}
        onDelete={onDelete}
      />,
    );

    // Open and delete
    fireEvent.click(screen.getByRole('button', { name: /evidence 1 of 1/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete big_photo\.jpg/i }));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(onCancelUpload).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalledWith(inFlightItem);
  });
});
