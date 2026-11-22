import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EvidenceCapture } from './EvidenceCapture';
import { renderIntl } from '@/tests/render';
import * as uploadModule from '@/lib/upload';

describe('EvidenceCapture (#113)', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-preview-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles capture of several files and reports progress with role="progressbar"', async () => {
    let progressCallback: ((p: { loaded: number; total: number; pct: number }) => void) | undefined;

    vi.spyOn(uploadModule, 'uploadEvidenceWithProgress').mockImplementation(
      async (_kind, _poolId, _file, opts) => {
        progressCallback = opts?.onProgress;
        return new Promise((resolve) => {
          setTimeout(() => {
            progressCallback?.({ loaded: 50, total: 100, pct: 50 });
            resolve({ evidenceId: 'ev-1', sha256: 'hash-1' });
          }, 50);
        });
      },
    );

    renderIntl(<EvidenceCapture poolId="pool-1" />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file1 = new File(['content1'], 'photo1.jpg', { type: 'image/jpeg' });
    const file2 = new File(['content2'], 'photo2.jpg', { type: 'image/jpeg' });

    await act(async () => {
      fireEvent.change(input, { target: { files: [file1, file2] } });
    });

    expect(screen.getByText('photo1.jpg')).toBeInTheDocument();
    expect(screen.getByText('photo2.jpg')).toBeInTheDocument();

    const progressbars = screen.getAllByRole('progressbar');
    expect(progressbars.length).toBeGreaterThan(0);
    expect(progressbars[0]).toHaveAttribute('aria-valuemin', '0');
    expect(progressbars[0]).toHaveAttribute('aria-valuemax', '100');

    await waitFor(() => {
      expect(screen.getAllByText('✓ Uploaded')).toHaveLength(2);
    });
  });

  it('allows cancelling an upload in progress', async () => {
    vi.spyOn(uploadModule, 'uploadEvidenceWithProgress').mockImplementation(
      async (_kind, _poolId, _file, opts) => {
        return new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Upload aborted', 'AbortError'));
          });
        });
      },
    );

    renderIntl(<EvidenceCapture poolId="pool-1" />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['content'], 'cancel-me.jpg', { type: 'image/jpeg' });

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(screen.getByText('cancel-me.jpg')).toBeInTheDocument();
    const cancelBtn = screen.getByRole('button', { name: /cancel upload of cancel-me\.jpg/i });

    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    expect(await screen.findByText('Upload cancelled')).toBeInTheDocument();
  });

  it('allows retrying a failed upload', async () => {
    let attempts = 0;
    vi.spyOn(uploadModule, 'uploadEvidenceWithProgress').mockImplementation(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('Network failure');
      }
      return { evidenceId: 'ev-ok', sha256: 'hash-ok' };
    });

    renderIntl(<EvidenceCapture poolId="pool-1" />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['content'], 'retry-me.jpg', { type: 'image/jpeg' });

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(await screen.findByText('Network failure')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry upload of retry-me\.jpg/i });
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('✓ Uploaded')).toBeInTheDocument();
    });
    expect(attempts).toBe(2);
  });

  it('rejects video exceeding maximum configured file size', async () => {
    renderIntl(<EvidenceCapture poolId="pool-1" maxVideoSizeBytes={10 * 1024 * 1024} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const hugeVideo = new File([new ArrayBuffer(15 * 1024 * 1024)], 'huge-delivery.mp4', {
      type: 'video/mp4',
    });

    await act(async () => {
      fireEvent.change(input, { target: { files: [hugeVideo] } });
    });

    expect(screen.getByText(/video exceeds 10 mb limit/i)).toBeInTheDocument();
  });
});
