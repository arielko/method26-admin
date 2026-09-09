// What the analytics tabs may honestly say about attribution.
//
// email_capture_enabled is a switch the studio can throw at any time, but
// attribution is recorded per row: gallery_favorites.visitor_id is nullable
// and independent of the flag. A link that captured emails, collected named
// clients, and then had capture switched off still has those people on
// record — so a banner derived from the flag alone would announce "cannot
// be attributed to a visitor" directly above a list of named clients, and
// "no one will appear here" directly above a populated table.
//
// These notices therefore read the DATA (how many rows carry a visitor) as
// well as the setting, and only make the absolute claim when the data
// actually supports it.

export type AttributionTab = 'favorites' | 'consensus' | 'visitors';

export type AttributionCounts = {
  emailCaptureEnabled: boolean;
  // Rows on this tab that carry a visitor identity.
  attributed: number;
  // Rows recorded with no visitor attached — unknowable who, not zero.
  unattributed: number;
};

// Named as the switch is actually labelled on Galleries → Settings → Access.
// It reads "Require name and email" there; telling the studio to look for
// "email capture" sends them hunting for a control that is not on screen.
const SWITCH = '“Require name and email” under Galleries → Settings → Access';

export function captureNotice(tab: AttributionTab, counts: AttributionCounts): string | null {
  if (counts.emailCaptureEnabled) return null;

  // Capture is off but people are already on record from when it was on.
  // Say what is actually true: the existing names stand, new activity is
  // what goes unattributed.
  if (counts.attributed > 0) {
    switch (tab) {
      case 'favorites':
        return `Email capture is off for this link. The picks below stay attributed, but new favorites from here on will not be — turn ${SWITCH} back on.`;
      case 'consensus':
        return `Email capture is off for this link. The ranking below covers visitors captured earlier; new votes will not join it until you turn ${SWITCH} back on.`;
      case 'visitors':
        return `Email capture is off for this link, so no new visitors are being recorded. The people below were captured while it was on.`;
    }
  }

  switch (tab) {
    case 'favorites':
      return `Email capture is off for this link — favorites are recorded but cannot be attributed to a visitor. Turn on ${SWITCH} to see who picked what.`;
    case 'consensus':
      return `Email capture is off for this link, so favorites carry no visitor identity and cannot be ranked by how many people picked each frame. Turn on ${SWITCH}.`;
    case 'visitors':
      return `Email capture is off for this link — no visitor identities are collected, so no one will appear here. Turn on ${SWITCH}.`;
  }
}
