import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Score Tracker - Group Scoreboard',
  description:
    'Track scores for mahjong, golf, board game nights, and recurring group events with local records, cloud sharing, and invite codes.',
  openGraph: {
    title: 'Score Tracker - Group Scoreboard',
    description:
      'Track date-based scores, cumulative rankings, and group score history with local records and cloud sharing.',
  },
};

export default function ScoreTrackerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}
