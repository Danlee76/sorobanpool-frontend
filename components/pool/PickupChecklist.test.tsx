import { screen, act, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PickupChecklist } from './PickupChecklist';
import { renderIntl } from '@/tests/render';
import type { EventSourceLike } from '@/lib/pool-stream';
import type { PickupMember } from '@/lib/types';

class FakeSource implements EventSourceLike {
  handlers = new Map<string, ((e: { data: string }) => void)[]>();
  closed = false;
  constructor(readonly url: string) {}
  addEventListener(type: string, cb: (e: { data: string }) => void) {
    const list = this.handlers.get(type) ?? [];
    list.push(cb);
    this.handlers.set(type, list);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data = '{}') {
    for (const cb of this.handlers.get(type) ?? []) cb({ data });
  }
}

const mockMembers: PickupMember[] = [
  {
    id: 'm-1',
    displayName: 'Amaka',
    units: 10,
    allocatedUnits: 8,
    status: 'collected',
    pickedUp: true,
    seq: 1,
  },
  {
    id: 'm-2',
    displayName: 'Babajide',
    units: 5,
    allocatedUnits: 5,
    status: 'pending',
    pickedUp: false,
    seq: 1,
  },
];

describe('PickupChecklist (#112)', () => {
  it('renders members with units and each status in words and not only by colour', () => {
    renderIntl(<PickupChecklist poolId="pool-1" initialMembers={mockMembers} totalExpectedUnits={13} />);

    expect(screen.getByText('Amaka')).toBeInTheDocument();
    expect(screen.getByText('Babajide')).toBeInTheDocument();
    expect(screen.getByText('8 units')).toBeInTheDocument();
    expect(screen.getByText('5 units')).toBeInTheDocument();

    // Check status words
    expect(screen.getByText('Collected')).toBeInTheDocument();
    expect(screen.getByText('Awaiting pickup')).toBeInTheDocument();

    // Summary counts
    expect(screen.getByText('1 of 2 collected (8 of 13 units)')).toBeInTheDocument();
  });

  it('NO control exists to mark a member collected, and row clicks/focus trigger no action', () => {
    renderIntl(<PickupChecklist poolId="pool-1" initialMembers={mockMembers} totalExpectedUnits={13} />);

    // No interactive checkboxes or toggles exist
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();

    // Clicking or focusing rows does not change anything
    const rows = screen.getAllByRole('row');
    fireEvent.click(rows[1]!);
    fireEvent.focus(rows[1]!);

    // Status remains strictly read-only
    expect(screen.getByText('Collected')).toBeInTheDocument();
    expect(screen.getByText('Awaiting pickup')).toBeInTheDocument();
  });

  it('updates member status when a live stream event arrives', () => {
    let fakeSource!: FakeSource;
    renderIntl(
      <PickupChecklist
        poolId="pool-1"
        initialMembers={mockMembers}
        totalExpectedUnits={13}
        streamFactory={(url) => (fakeSource = new FakeSource(url))}
      />,
    );

    expect(screen.getByText('1 of 2 collected (8 of 13 units)')).toBeInTheDocument();
    expect(screen.getByText('Awaiting pickup')).toBeInTheDocument();

    // Emit live stream event that Babajide confirmed collection
    act(() => {
      fakeSource.emit(
        'pool',
        JSON.stringify({
          totalUnits: 13,
          members: 2,
          memberEvent: {
            memberId: 'm-2',
            status: 'collected',
            seq: 2,
          },
        }),
      );
    });

    // Summary should update to 2 of 2 collected
    expect(screen.getByText('2 of 2 collected (13 of 13 units)')).toBeInTheDocument();
    expect(screen.queryByText('Awaiting pickup')).toBeNull();
    expect(screen.getAllByText('Collected')).toHaveLength(2);
  });

  it('drops duplicate and out-of-order stream events', () => {
    let fakeSource!: FakeSource;
    renderIntl(
      <PickupChecklist
        poolId="pool-1"
        initialMembers={mockMembers}
        totalExpectedUnits={13}
        streamFactory={(url) => (fakeSource = new FakeSource(url))}
      />,
    );

    // Apply seq 5
    act(() => {
      fakeSource.emit(
        'pool',
        JSON.stringify({
          totalUnits: 13,
          members: 2,
          memberEvent: {
            memberId: 'm-2',
            status: 'collected',
            seq: 5,
          },
        }),
      );
    });
    expect(screen.getAllByText('Collected')).toHaveLength(2);

    // Try applying older seq 3 (out of order or duplicate) with status pending: should be dropped!
    act(() => {
      fakeSource.emit(
        'pool',
        JSON.stringify({
          totalUnits: 13,
          members: 2,
          memberEvent: {
            memberId: 'm-2',
            status: 'pending',
            seq: 3,
          },
        }),
      );
    });

    // Status remains collected
    expect(screen.getAllByText('Collected')).toHaveLength(2);
  });

  it('buffers events that arrive before initial list and applies them on load', () => {
    let fakeSource!: FakeSource;
    const { rerender } = renderIntl(
      <PickupChecklist
        poolId="pool-1"
        initialMembers={undefined}
        totalExpectedUnits={13}
        streamFactory={(url) => (fakeSource = new FakeSource(url))}
      />,
    );

    // Stream event arrives before initialMembers are loaded
    act(() => {
      fakeSource.emit(
        'pool',
        JSON.stringify({
          totalUnits: 13,
          members: 2,
          memberEvent: {
            memberId: 'm-2',
            status: 'collected',
            seq: 10,
          },
        }),
      );
    });

    // Now initial list loads with Babajide still marked pending at seq 1
    rerender(
      <PickupChecklist
        poolId="pool-1"
        initialMembers={mockMembers}
        totalExpectedUnits={13}
        streamFactory={() => fakeSource}
      />,
    );

    // Babajide should be merged to collected from the buffered event
    expect(screen.getAllByText('Collected')).toHaveLength(2);
    expect(screen.getByText('2 of 2 collected (13 of 13 units)')).toBeInTheDocument();
  });

  it('shows live updates paused when the stream disconnects and refetches on reconnect', () => {
    let fakeSource!: FakeSource;
    const onRefresh = vi.fn();
    renderIntl(
      <PickupChecklist
        poolId="pool-1"
        initialMembers={mockMembers}
        streamFactory={(url) => (fakeSource = new FakeSource(url))}
        onRefreshNeeded={onRefresh}
      />,
    );

    // Disconnect stream
    act(() => {
      fakeSource.emit('error');
    });

    expect(screen.getByRole('status')).toHaveTextContent('Live updates paused. Reconnecting…');

    // Reconnect
    act(() => {
      fakeSource.emit('open');
    });

    expect(onRefresh).toHaveBeenCalled();
    expect(screen.queryByText('Live updates paused. Reconnecting…')).toBeNull();
  });

  it('renders an accessible empty list state when no members exist', () => {
    renderIntl(<PickupChecklist poolId="pool-empty" initialMembers={[]} totalExpectedUnits={0} />);

    expect(screen.getByText('No members in this group buy.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
