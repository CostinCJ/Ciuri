'use client';

import type { Seat } from '@/lib/game';
import type { ReadyRoom } from '@/lib/client/use-room';
import { BID_SECONDS, PLAY_SECONDS } from '@/lib/game-timing';
import { SEATS, isOffline, positionOf, seatNames, type Position } from '@/lib/ui/seats';
import { CenterArea } from './CenterArea';
import { EventLog } from './EventLog';
import { MyArea } from './MyArea';
import { PlayerSeat } from './PlayerSeat';
import { RoundSummary } from './RoundSummary';
import { ScoreBar } from './ScoreBar';

const SEAT_SLOT: Record<Position, string> = {
  top: 'col-start-2 row-start-1',
  left: 'col-start-1 row-start-2',
  right: 'col-start-3 row-start-2',
  bottom: 'col-start-2 row-start-3',
};
const MOVE_SECONDS = { bidding: BID_SECONDS, playing: PLAY_SECONDS } as const;

export function Table({ room }: { room: ReadyRoom }) {
  const { data, userId, online } = room;
  const game = data.game;
  if (!game) return <p className="p-8 text-center">Se pregătește jocul…</p>;

  const view = game.view;
  const round = view.round;
  const names = seatNames(data.players);
  const mySeat: Seat | null = data.players.find((p) => p.user_id === userId)?.seat ?? null;
  const turnActive = view.phase === 'bidding' || view.phase === 'playing';
  const moveDeadline = turnActive ? game.deadline : null;
  const moveSeconds = turnActive ? MOVE_SECONDS[view.phase as 'bidding' | 'playing'] : 0;

  return (
    <div className="flex flex-1 flex-col gap-3 short:gap-1">
      <ScoreBar view={view} names={names} inProgress={data.room.status === 'playing' && view.phase !== 'matchOver'} />
      <div className="grid flex-1 grid-cols-[1fr_2fr_1fr] grid-rows-[auto_1fr_auto] items-center gap-2 short:gap-1">
        {SEATS.filter((seat) => seat !== mySeat).map((seat) => {
          const player = data.players.find((p) => p.seat === seat);
          return (
            <div key={seat} className={`${SEAT_SLOT[positionOf(seat, mySeat)]} flex justify-center`}>
              <PlayerSeat
                name={names[seat]}
                team={seat % 2 === 0 ? 'A' : 'B'}
                cardCount={round.handCounts[seat]}
                isTurn={turnActive && round.turn === seat}
                isDealer={round.dealer === seat}
                offline={isOffline(online, player?.user_id)}
                sittingOut={!round.active.includes(seat)}
                bid={round.bids.findLast((b) => b.seat === seat)?.bid ?? null}
                deadline={turnActive && round.turn === seat ? moveDeadline : null}
                moveSeconds={moveSeconds}
              />
            </div>
          );
        })}
        <div className="col-start-2 row-start-2">
          <CenterArea view={view} names={names} viewer={mySeat} />
        </div>
      </div>

      {data.hand && mySeat !== null && (
        <MyArea
          code={data.room.code}
          view={view}
          version={game.version}
          hand={data.hand}
          seat={mySeat}
          deadline={turnActive && round.turn === mySeat ? moveDeadline : null}
          onMove={room.applyGame}
        />
      )}
      <EventLog log={game.log} names={names} />
      <RoundSummary code={data.room.code} view={view} names={names} mySeat={mySeat} deadline={game.deadline} />
    </div>
  );
}
