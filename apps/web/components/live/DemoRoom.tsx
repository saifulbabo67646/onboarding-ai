'use client';

import {
  BarVisualizer,
  ControlBar,
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useLocalParticipant,
  useTracks,
  useTranscriptions,
  useVoiceAssistant,
  VideoTrack,
} from '@livekit/components-react';
import { DisconnectReason, Track, type AudioCaptureOptions } from 'livekit-client';
import { MessageSquareText } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Avatar, Badge, Spinner } from '@/components/ui';
import { cx } from '@/lib/cx';
import type { ConnectionDetails, PublicAgent } from '@/lib/types';
import styles from './DemoRoom.module.css';

// Let the browser clean up the visitor's mic before it reaches the presenter:
// fewer breaths, keyboard clicks and echoes of the presenter's own voice.
const MIC_OPTIONS: AudioCaptureOptions = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  voiceIsolation: true,
};

export function DemoRoom({
  details,
  agent,
  onLeave,
}: {
  details: ConnectionDetails;
  agent: PublicAgent;
  /** `endedByPresenter` is true when the presenter hung up (closed the room). */
  onLeave: (endedByPresenter: boolean) => void;
}) {
  return (
    <LiveKitRoom
      serverUrl={details.serverUrl}
      token={details.participantToken}
      connect
      audio={MIC_OPTIONS}
      video={false}
      onDisconnected={(reason) => onLeave(reason === DisconnectReason.ROOM_DELETED)}
      data-lk-theme="default"
      className={styles.room}
    >
      <RoomAudioRenderer />
      <Stage agent={agent} />
      <aside className={styles.sidebar}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>On the call</h2>
          <div className="stack-sm">
            <PresenterTile agent={agent} />
            <VisitorTile name={details.participantName} />
          </div>
        </section>
        <Captions presenterName={agent.presenterName} />
      </aside>
      <div className={styles.controls}>
        <StartAudio label="Click to hear the presenter" className={styles.startAudio} />
        <ControlBar
          variation="minimal"
          controls={{
            microphone: true,
            camera: true,
            screenShare: false,
            chat: false,
            leave: true,
          }}
        />
      </div>
    </LiveKitRoom>
  );
}

function Stage({ agent }: { agent: PublicAgent }) {
  const screens = useTracks([Track.Source.ScreenShare], { onlySubscribed: true });
  const screen = screens.find((t) => !t.participant.isLocal);
  return (
    <section className={styles.stage}>
      {screen ? (
        <VideoTrack trackRef={screen} className={styles.screen} />
      ) : (
        <div className={styles.waiting}>
          <Spinner size={28} />
          <p>{agent.presenterName} is getting their screen ready…</p>
        </div>
      )}
    </section>
  );
}

function PresenterTile({ agent }: { agent: PublicAgent }) {
  const { state, audioTrack, agent: participant } = useVoiceAssistant();
  return (
    <div className={cx(styles.tile, state === 'speaking' && styles.speaking)}>
      <Avatar name={agent.presenterName} brand />
      <div className={styles.tileText}>
        <div className={styles.tileName}>{agent.presenterName}</div>
        <div className={styles.tileSub}>
          {participant
            ? agent.companyName
              ? `Presenting for ${agent.companyName}`
              : 'Presenting'
            : 'Joining…'}
        </div>
      </div>
      {audioTrack && (
        <BarVisualizer
          state={state}
          trackRef={audioTrack}
          barCount={5}
          className={styles.visualizer}
        />
      )}
    </div>
  );
}

function VisitorTile({ name }: { name: string }) {
  const { localParticipant, isCameraEnabled } = useLocalParticipant();
  const cam = useTracks([Track.Source.Camera]).find((t) => t.participant.isLocal);
  return (
    <div className={cx(styles.tile, isCameraEnabled && styles.tileVideo)}>
      {isCameraEnabled && cam ? (
        <VideoTrack trackRef={cam} className={styles.camera} />
      ) : (
        <Avatar name={name} />
      )}
      <div className={styles.tileText}>
        <div className={styles.tileName}>
          {name} <span className={styles.tileSub}>(you)</span>
        </div>
      </div>
      {localParticipant.isSpeaking && (
        <Badge tone="success" dot>
          Speaking
        </Badge>
      )}
    </div>
  );
}

function Captions({ presenterName }: { presenterName: string }) {
  const transcriptions = useTranscriptions();
  const { localParticipant } = useLocalParticipant();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Braces matter: newer Chrome returns a Promise from scrollIntoView, and React
    // would treat any returned value as the effect's cleanup function.
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [transcriptions]);
  return (
    <section className={cx(styles.section, styles.captions)}>
      <h2 className={styles.sectionTitle}>Live captions</h2>
      {transcriptions.length === 0 && (
        <p className={styles.hint}>
          <MessageSquareText size={14} aria-hidden /> Ask questions out loud at any time - the
          presenter will pause and answer.
        </p>
      )}
      {transcriptions.slice(-40).map((t) => {
        const mine = t.participantInfo.identity === localParticipant.identity;
        return (
          <div key={t.streamInfo.id} className={styles.caption}>
            <span className={styles.captionWho}>{mine ? 'You' : presenterName}</span>
            {t.text}
          </div>
        );
      })}
      <div ref={end} />
    </section>
  );
}
