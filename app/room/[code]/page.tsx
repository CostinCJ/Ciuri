import { RoomLoader } from '@/components/room/RoomLoader';

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RoomLoader code={code.toUpperCase()} />;
}
