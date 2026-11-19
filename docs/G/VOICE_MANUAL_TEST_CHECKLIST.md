# G voice: manual test checklist (real microphones)

## What is already tested, and what is not

| | Simulated (automated) | Real device (this checklist) |
|---|---|---|
| **How** | Headless Chromium with a spec-faithful fake `SpeechRecognition` and `speechSynthesis` (`scripts/g-voice-e2e.mjs` 18/18, `scripts/g-wake-e2e.mjs` 31/31) | A person speaking into a real microphone in a real browser |
| **Proves** | G's state machine: listening, sending, speaking, stop, interrupt, mute, errors, the 15s stall timeout, Arabic language code, voice↔text, navigation, opt-in "Hey G", sign-out cleanup, phone layout | That the browser's speech service actually hears and transcribes you, that the system asks for permission as described, that audio plays, and the real latency |
| **Does not prove** | Recognition accuracy, real permission prompts, audio output, Safari/Firefox/mobile behaviour | Logic already covered by the automated suites |

**Before you start:**
- Use a test account on a non-production deployment (the Preview), never a real creator's account.
- G sends recognised **text** to Green Light and stores no audio. The browser's own speech service (Google for Chrome, Apple for Safari) may process the audio; the panel says so.

## Expected browser support

| Browser | Push-to-talk voice | Spoken replies | "Hey G" | Notes |
|---|---|---|---|---|
| Chrome desktop | Yes | Yes | Yes (opt-in) | Recognition is a network service (needs internet) |
| Safari macOS / iOS | Usually (`webkitSpeechRecognition`, Safari 14.1+) | Yes | Yes (opt-in) | Dictation/Siri may need to be enabled in system settings |
| Firefox | **No**. Firefox ships no speech recognition | Yes | No | The mic button must be absent, with the "voice not supported" note; typing works |
| Chrome Android | Yes | Yes | Yes (opt-in) | Test with the screen on; G pauses listening when the tab is hidden |
| Safari iOS | See Safari | Yes | Yes (opt-in) | Test both the "Ask G" tab bar button and the panel mic |

Record **Pass / Fail / Not supported** and a note for every row below, for each browser tested.

## A. Permission

| # | Step | Expected |
|---|---|---|
| A1 | Fresh profile or site data cleared. Open G and press the mic | The browser asks for microphone permission. Nothing listens before you press |
| A2 | Deny the permission | A clear "microphone blocked" message; the mic can be retried; typing still works |
| A3 | Allow it in the browser's site settings, then press the mic again | Listening starts |
| A4 | Revoke the permission while "Hey G" is on | It turns off with an explanation, and the indicator disappears |

## B. Listening, processing, speaking

| # | Step | Expected |
|---|---|---|
| B1 | Press the mic and say "How is my channel performing?" | A listening indicator with a Stop control. When you stop talking, a "thinking" state, then the answer is shown and (with spoken replies on) read aloud |
| B2 | Stay silent after pressing the mic | It returns to idle with a hint, within about 15s at most |
| B3 | Press Stop while listening | It stops at once, with no error message |
| B4 | Turn spoken replies off and ask by voice | The answer is shown and not read aloud |
| B5 | Mute while G is speaking, then unmute and ask again | Speech stops at once; the next answer is spoken |

## C. Interrupting, and switching modes

| # | Step | Expected |
|---|---|---|
| C1 | While G is speaking a long answer, press the mic | Speech stops and listening starts |
| C2 | Ask by voice, then type a follow-up | The conversation continues in one thread |
| C3 | Ask by voice, then navigate to another page | The conversation is kept; the microphone is **off** after navigation |

## D. Arabic and English

| # | Step | Expected |
|---|---|---|
| D1 | Site language Arabic; ask by voice in Arabic | Recognised as Arabic (ar-EG); the answer is in Arabic and read with an Arabic voice when the device has one |
| D2 | Site language English; ask in English | Recognised as English; answered in English |
| D3 | "Hey G" on, Arabic: say «يا G، ما أداء قناتي؟» | G opens and only the question is sent, without the wake phrase |

## E. "Hey G" (opt-in, off by default)

| # | Step | Expected |
|---|---|---|
| E1 | First visit | Off. No microphone request, no indicator |
| E2 | Turn it on | A consent card (microphone, external processing, how to turn it off), then the permission prompt |
| E3 | Talk normally without the phrase | Nothing happens; nothing is sent |
| E4 | Say "Hey G" | G opens with a chime (if spoken replies are on) and listens for the question |
| E5 | Switch to another tab for 10s, then come back | Listening pauses while hidden and resumes when visible. **There is no background or always-on listening** |
| E6 | Press "Turn off" on the red indicator | It stops at once and stays off after a refresh |

## F. Mobile

| # | Step | Expected |
|---|---|---|
| F1 | Phone: open G from the tab bar's "Ask G", use the mic | Same as B1. The panel covers the content and the keyboard does not hide the mic |
| F2 | Lock the screen while listening | Listening stops; no error loop on unlock |
| F3 | "Hey G" on: the indicator sits above the tab bar | Visible, and does not cover the tab bar |

## G. Cleanup

| # | Step | Expected |
|---|---|---|
| G1 | Sign out while listening or with "Hey G" on | The microphone is released (the browser's mic indicator turns off) and G's conversation is cleared |
| G2 | Close the tab while listening | The browser's mic indicator turns off |
| G3 | Sign in again in the same tab | "Hey G" is off, and the conversation is empty |

## Reporting

For each browser, give:
- the browser and OS version;
- the device;
- the microphone used;
- the table above with Pass / Fail / Not supported, plus notes.

For any Fail, give the time it happened and what was said. Add a screenshot or screen recording where possible.
