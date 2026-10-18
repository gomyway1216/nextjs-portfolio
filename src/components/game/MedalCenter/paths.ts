/** Where the medal center's front is, and where each of its machines stands. The hub's reset is there, so moving it is one line here. */
export const MEDAL_CENTER_PATH = '/games/medal-center';
export const MEDAL_PUSHER_PATH = '/games/medal-pusher';
/** The player's own page at the medal center: their medals, their history and their records at every machine. */
export const MY_PAGE_PATH = '/games/medal-center/records';
/** Where a machine on the floor stands: every one that plays rounds is under the games, by its name at the bank. */
export const machinePath = (game: string): string => `/games/${game}`;
