'use client';

import { useEffect, useReducer, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { shortAddress } from '@/lib/format';
import { subscribePoolEvents, type StreamFactory, type StreamStatus } from '@/lib/pool-stream';
import type { PickupMember, PickupMemberEvent, PickupStatus } from '@/lib/types';

export interface PickupChecklistProps {
  poolId: string;
  initialMembers?: PickupMember[];
  totalExpectedUnits?: number;
  streamFactory?: StreamFactory;
  onRefreshNeeded?: () => void;
}

interface ChecklistState {
  isLoaded: boolean;
  members: PickupMember[];
  pendingEvents: PickupMemberEvent[];
  streamStatus: StreamStatus;
  lastAnnouncement: string | null;
}

type ChecklistAction =
  | { type: 'SET_INITIAL_MEMBERS'; members: PickupMember[] }
  | { type: 'RECEIVE_EVENT'; event: PickupMemberEvent }
  | { type: 'SET_STREAM_STATUS'; status: StreamStatus }
  | { type: 'CLEAR_ANNOUNCEMENT' };

function sortMembersStably(members: PickupMember[]): PickupMember[] {
  return [...members].sort((a, b) => a.id.localeCompare(b.id));
}

function checklistReducer(state: ChecklistState, action: ChecklistAction): ChecklistState {
  switch (action.type) {
    case 'SET_INITIAL_MEMBERS': {
      let merged = [...action.members];

      // Replay any pending events that arrived before initial load
      if (state.pendingEvents.length > 0) {
        for (const ev of state.pendingEvents) {
          const idx = merged.findIndex((m) => m.id === ev.memberId);
          if (idx !== -1) {
            const current = merged[idx]!;
            if (ev.seq === undefined || current.seq === undefined || ev.seq > current.seq) {
              merged[idx] = {
                ...current,
                status: ev.status,
                pickedUp: ev.status === 'collected',
                seq: ev.seq ?? current.seq,
              };
            }
          }
        }
      }

      return {
        ...state,
        isLoaded: true,
        members: sortMembersStably(merged),
        pendingEvents: [],
      };
    }

    case 'RECEIVE_EVENT': {
      const { event } = action;

      // Event arrived before initial member list was loaded: buffer it
      if (!state.isLoaded) {
        return {
          ...state,
          pendingEvents: [...state.pendingEvents, event],
        };
      }

      const idx = state.members.findIndex((m) => m.id === event.memberId);
      if (idx === -1) {
        return state;
      }

      const current = state.members[idx]!;

      // Handle duplicate or out-of-order events
      if (event.seq !== undefined && current.seq !== undefined && event.seq <= current.seq) {
        return state;
      }

      // No status change: ignore
      if (current.status === event.status) {
        return state;
      }

      const updatedMember: PickupMember = {
        ...current,
        status: event.status,
        pickedUp: event.status === 'collected',
        seq: event.seq ?? current.seq,
      };

      const updatedMembers = [...state.members];
      updatedMembers[idx] = updatedMember;

      const memberName = current.displayName || (current.address ? shortAddress(current.address) : current.id);
      const announcement =
        event.status === 'collected'
          ? `${memberName} collected ${current.allocatedUnits} units`
          : null;

      return {
        ...state,
        members: sortMembersStably(updatedMembers),
        lastAnnouncement: announcement,
      };
    }

    case 'SET_STREAM_STATUS':
      return {
        ...state,
        streamStatus: action.status,
      };

    case 'CLEAR_ANNOUNCEMENT':
      return {
        ...state,
        lastAnnouncement: null,
      };

    default:
      return state;
  }
}

/**
 * Organizer pickup checklist (Brief 8.4):
 * Displays members, allocated units, and collected status updated live from the stream.
 *
 * CRITICAL TRUST RULE:
 * Organizers CANNOT mark members collected. A member is marked collected ONLY
 * through their own in-app confirmation (on-chain / pickup endpoint).
 * No buttons, checkboxes, keyboard shortcuts, or mutation calls exist in this component.
 */
export function PickupChecklist({
  poolId,
  initialMembers,
  totalExpectedUnits,
  streamFactory,
  onRefreshNeeded,
}: PickupChecklistProps) {
  const t = useTranslations('organize.delivery');
  const common = useTranslations('common');

  const [state, dispatch] = useReducer(checklistReducer, {
    isLoaded: initialMembers !== undefined,
    members: initialMembers ? sortMembersStably(initialMembers) : [],
    pendingEvents: [],
    streamStatus: 'idle',
    lastAnnouncement: null,
  });

  const prevStatusRef = useRef<StreamStatus>('idle');

  // Sync initial members when prop changes
  useEffect(() => {
    if (initialMembers !== undefined) {
      dispatch({ type: 'SET_INITIAL_MEMBERS', members: initialMembers });
    }
  }, [initialMembers]);

  // Subscribe to live pool events
  useEffect(() => {
    if (!poolId) return;

    const unsubscribe = subscribePoolEvents(
      poolId,
      {
        onStatus(status) {
          dispatch({ type: 'SET_STREAM_STATUS', status });

          // Reconnected after drop: trigger refetch if requested
          if (prevStatusRef.current === 'stale' && status === 'live') {
            onRefreshNeeded?.();
          }
          prevStatusRef.current = status;
        },
        onFrame(payload) {
          if (!payload) return;

          // Check if payload contains per-member pickup event
          const p = payload as unknown as { memberEvent?: PickupMemberEvent; memberId?: string; status?: PickupStatus; seq?: number };
          if (p.memberEvent) {
            dispatch({ type: 'RECEIVE_EVENT', event: p.memberEvent });
          } else if (p.memberId && p.status) {
            dispatch({
              type: 'RECEIVE_EVENT',
              event: {
                memberId: p.memberId,
                status: p.status,
                seq: p.seq,
              },
            });
          }
        },
      },
      streamFactory,
    );

    return () => {
      unsubscribe();
    };
  }, [poolId, streamFactory, onRefreshNeeded]);

  const totalMembers = state.members.length;
  const collectedMembers = state.members.filter((m) => m.status === 'collected' || m.pickedUp).length;
  const collectedUnits = state.members
    .filter((m) => m.status === 'collected' || m.pickedUp)
    .reduce((sum, m) => sum + (m.allocatedUnits ?? m.units ?? 0), 0);
  const totalUnits =
    totalExpectedUnits ??
    state.members.reduce((sum, m) => sum + (m.allocatedUnits ?? m.units ?? 0), 0);

  return (
    <section aria-labelledby="pickup-checklist-title" className="space-y-3">
      {/* Polite live announcement region for screen readers */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {state.lastAnnouncement}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="pickup-checklist-title" className="text-lg font-bold text-neutral-900">
          {t('checklistTitle')}
        </h2>
        {state.streamStatus === 'stale' && (
          <p
            role="status"
            aria-live="polite"
            className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900"
          >
            {t('livePaused')}
          </p>
        )}
      </div>

      {/* Summary count */}
      {totalMembers > 0 && (
        <p className="text-sm font-medium text-neutral-700">
          {t('checklistSummary', {
            collectedCount: collectedMembers,
            totalCount: totalMembers,
            collectedUnits,
            totalUnits,
          })}
        </p>
      )}

      {/* Empty State */}
      {totalMembers === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6 text-center text-sm text-neutral-600">
          <p>{t('emptyList')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200 text-left text-sm">
            <caption className="sr-only">{t('checklistTitle')}</caption>
            <thead className="bg-neutral-50">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold text-neutral-900">
                  {t('memberHeader')}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-neutral-900">
                  {t('unitsHeader')}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-neutral-900">
                  {t('statusHeader')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {state.members.map((member) => {
                const isCollected = member.status === 'collected' || !!member.pickedUp;
                const displayName =
                  member.displayName ||
                  (member.address ? shortAddress(member.address) : member.id);
                const statusLabel = isCollected ? t('statusCollected') : t('statusPending');

                return (
                  <tr key={member.id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-neutral-900">
                      {displayName}
                    </td>
                    <td className="px-4 py-3.5 text-neutral-700">
                      {common('unitsCount', { count: member.allocatedUnits ?? member.units })}
                    </td>
                    <td className="px-4 py-3.5">
                      {/*
                        Read-only status indicator.
                        NO checkbox, NO toggle, NO click-to-mark.
                        The organizer has NO manual way to change this status.
                      */}
                      <div className="flex items-center gap-2">
                        <span
                          role="img"
                          aria-label={statusLabel}
                          className={`inline-flex size-5 items-center justify-center rounded-full text-xs font-bold ${
                            isCollected
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-neutral-100 text-neutral-500'
                          }`}
                        >
                          {isCollected ? '✓' : '○'}
                        </span>
                        <span
                          className={`font-semibold ${
                            isCollected ? 'text-emerald-800' : 'text-neutral-600'
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
