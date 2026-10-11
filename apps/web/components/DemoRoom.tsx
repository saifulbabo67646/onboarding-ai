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
import { Track, type AudioCaptureOptions } from 'livekit-client';
import { useEffect, useRef } from 'react';
import type { ConnectionDetails, PublicAgent } from '@/lib/types';

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
  onLeave: () => void;
}) {
  return (
    <LiveKitRoom
      serverUrl={details.serverUrl}
      token={details.participantToken}
      connect
      audio={MIC_OPTIONS}
      video={false}
      onDisconnected={onLeave}
    >
      <RoomAudioRenderer />
      <div className="room">
        <Stage agent={agent} />
        <aside className="sidebar">
          <div className="sidebar-section">
            <h2>On the call</h2>
            <div className="tiles">
              <PresenterTile agent={agent} />
              <VisitorTile name={details.participantName} />
            </div>
          </div>
          <Captions presenterName={agent.presenterName} />
        </aside>
        <div className="controls">
          <StartAudio label="Click to hear the presenter" className="btn btn-primary" />
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
      </div>
    </LiveKitRoom>
  );
}

function Stage({ agent }: { agent: PublicAgent }) {
  const screens = useTracks([Track.Source.ScreenShare], { onlySubscribed: true });
  const screen = screens.find((t) => !t.participant.isLocal);
  return (
    <section className="stage">
      {screen ? (
        <VideoTrack trackRef={screen} />
      ) : (
        <div className="stage-waiting">
          <div className="spinner" />
          <p style={{ margin: 0 }}>{agent.presenterName} is getting their screen ready…</p>
        </div>
      )}
    </section>
  );
}

function PresenterTile({ agent }: { agent: PublicAgent }) {
  const { state, audioTrack, agent: participant } = useVoiceAssistant();
  const speaking = state === 'speaking';
  return (
    <div className={`presenter-tile ${speaking ? 'speaking' : ''}`}>
      <div className="avatar">{agent.presenterName.slice(0, 1).toUpperCase()}</div>
      <div>
        <div style={{ fontWeight: 600 }}>{agent.presenterName}</div>
        <div className="faint" style={{ fontSize: 12.5 }}>
          {participant
            ? agent.companyName
              ? `Presenting for ${agent.companyName}`
              : 'Presenting'
            : 'Joining…'}
        </div>
      </div>
      {audioTrack && <BarVisualizer state={state} trackRef={audioTrack} barCount={5} />}
    </div>
  );
}

function VisitorTile({ name }: { name: string }) {
  const { localParticipant, isCameraEnabled } = useLocalParticipant();
  const cams = useTracks([Track.Source.Camera]).filter((t) => t.participant.isLocal);
  return (
    <div className="presenter-tile" style={{ flexDirection: isCameraEnabled ? 'column' : 'row' }}>
      {isCameraEnabled && cams[0] ? (
        <VideoTrack trackRef={cams[0]} style={{ width: '100%', borderRadius: 8 }} />
      ) : (
        <div className="avatar" style={{ background: 'var(--bg-sunken)' }}>
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div style={{ fontWeight: 600, alignSelf: 'flex-start' }}>
        {name} <span className="faint">(you)</span>
      </div>
      {localParticipant.isSpeaking && <span className="badge badge-live">speaking</span>}
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
    <div className="captions">
      <h2 style={{ marginBottom: 0 }}>Live captions</h2>
      {transcriptions.length === 0 && (
        <p className="faint" style={{ margin: 0, fontSize: 13.5 }}>
          Ask questions out loud at any time - the presenter will pause and answer.
        </p>
      )}
      {transcriptions.slice(-40).map((t) => {
        const mine = t.participantInfo.identity === localParticipant.identity;
        return (
          <div key={t.streamInfo.id} className="caption">
            <span className="who">{mine ? 'You' : presenterName}</span>
            {t.text}
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}
