// Static ElevenLabs VO, one bundled file per question, keyed by the
// backend's question `id` rather than its position/index in the fetched
// list (CLAUDE.md) - reordering, adding, or removing questions on the
// backend can never cause this lookup to silently play the wrong clip; a
// question whose id isn't in this map (not yet recorded, or a question
// added after this build shipped) just falls back to no audio. Nested by
// language for when a real language selector lands - only "en" exists
// today. These 5 ids are the current internal test client's seeded
// questions (see prisma/seed.ts in the backend repo); a different client's
// questions won't have bundled audio until their own clips are added here
// the same way.
//
// Shared between QuestionBriefScreen's "Read to me" and CameraCheckScreen's
// read-aloud-during-countdown - both play the same clip for the same
// question, just at different moments in the flow.
const QUESTION_AUDIO_EN: Record<string, number> = {
  'fdcab4b7-4fdb-4c85-ab29-1adc9635e0bb': require('./assets/audio/q_fdcab4b7-4fdb-4c85-ab29-1adc9635e0bb_en.mp3'),
  '49c64b94-f559-49e4-9bd4-be6c6c66f969': require('./assets/audio/q_49c64b94-f559-49e4-9bd4-be6c6c66f969_en.mp3'),
  '2a6cecb3-281a-44eb-987b-51253563e6b9': require('./assets/audio/q_2a6cecb3-281a-44eb-987b-51253563e6b9_en.mp3'),
  '61dcfdb7-a9f9-4167-afe2-0d0850b7b056': require('./assets/audio/q_61dcfdb7-a9f9-4167-afe2-0d0850b7b056_en.mp3'),
  '665cd44a-5828-4c1a-b5f0-86a42c22f754': require('./assets/audio/q_665cd44a-5828-4c1a-b5f0-86a42c22f754_en.mp3'),
};

// null (not a missing key in the map) when there's no bundled clip for this
// question - callers pass this straight into useVideoPlayer, which accepts
// a null source and stays inert, so a missing clip falls back to no audio
// rather than crashing or blocking anything (CLAUDE.md).
export function getQuestionAudioSource(questionId: string | undefined): number | null {
  return questionId != null ? (QUESTION_AUDIO_EN[questionId] ?? null) : null;
}
