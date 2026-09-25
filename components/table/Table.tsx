'use client';

import type { Seat } from '@/lib/game';
import { useNow } from '@/lib/client/use-now';
import type { ReadyRoom } from '@/lib/client/use-room';
import { SEATS, positionOf, seatNames, type Position } from '@/lib/ui/seats';
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
const MOVE_SECONDS = { bidding: 20, playing: 30 } as const;

export function Table({ room }: { room: ReadyRoom }) {
  const now = useNow();
  const { data, userId, online } = room;
  const game = data.game;
  if (!game) return <p className="p-8 text-center">Se pregătește jocul…</p>;

  const view = game.view;
  const round = view.round;
  const names = seatNames(data.players);
  const mySeat: Seat | null = data.players.find((p) => p.user_id === userId)?.seat ?? null;
  const msLeft = game.deadline ? Math.max(0, new Date(game.deadline).getTime() - now) : null;
  const secondsLeft = msLeft === null ? null : Math.ceil(msLeft / 1000);
  const total = view.phase === 'bidding' || view.phase === 'playing' ? MOVE_SECONDS[view.phase] : null;
  const turnActive = view.phase === 'bidding' || view.phase === 'playing';

  return (
    <div className="flex flex-1 flex-col gap-3 short:gap-1">
      <ScoreBar view={view} names={names} />
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
                offline={player ? !online.has(player.user_id) : true}
                sittingOut={!round.active.includes(seat)}
                bid={round.bids.find((b) => b.seat === seat)?.bid ?? null}
                timeLeft={turnActive && round.turn === seat && msLeft !== null && total ? msLeft / (total * 1000) : null}
                secondsLeft={secondsLeft}
              />
            </div>
          );
        })}
        <div className="col-start-2 row-start-2">
          <CenterArea view={view} names={names} viewer={mySeat} />
        </div>
      </div>

      {data.hand && mySeat !== null && (
        <MyArea code={data.room.code} view={view} hand={data.hand} secondsLeft={turnActive && round.turn === mySeat ? secondsLeft : null} />
      )}
      <EventLog log={game.log} names={names} />
      <RoundSummary code={data.room.code} view={view} names={names} mySeat={mySeat} secondsLeft={secondsLeft} />
    </div>
  );
}
