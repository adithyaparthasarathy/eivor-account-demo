// The three tabs part O4b built (Calendar, Robot, Profile), drawn together from
// the state. Each lives in its own file; this one only calls them in turn, and
// keeps the names app.js and setup.js already use.
import { $, copyLink } from './ui.js';
import { renderCalendar, clearCalendar } from './calendar.js';
import { renderRobot, clearRobot, fillFacts, putBackFacts } from './robot.js';
import { renderProfile, clearProfile, fillProfile } from './profile.js';

export { fillFacts, fillProfile, copyLink, putBackFacts };

export function renderParts(a) {
  renderCalendar(a);
  renderRobot(a);
  renderProfile(a);
}

export function clearParts() {
  clearCalendar();
  clearRobot();
  clearProfile();
  for (const sel of ['[data-calls]', '[data-holds]', '[data-month]', '[data-counts]', '[data-today-urgent]', '[data-today-latest]', '[data-today-holds]', '[data-today-facts]', '[data-today-empty]', '[data-sheet-body]']) $(sel).replaceChildren();
  for (const sel of ['[data-who]', '[data-robot-updated]', '[data-greeting]', '[data-today-line]', '[data-line-word]', '[data-pause-sentence]', '[data-line-now]', '[data-line-number]']) $(sel).textContent = '';
  $('[data-calendar-url]').value = '';
  $('[data-calendar-url-setup]').value = '';
}

export function fillCalendarLink(a) {
  $('[data-calendar-url-setup]').value = a.state.calendarUrl || '';
}
