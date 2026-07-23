// A small footer, shown under every tab, linking to help and issue reporting.
// Miro's design guidelines require accessible support resources; the product's
// "lean panel" rule keeps this to two unobtrusive text links rather than a
// header or a dedicated tab. External links open in a new tab (the panel is a
// Miro-owned iframe, so navigating it away would close the app).

import './PanelFooter.css';

// The user guide is the end-user "help center"; Issues is the support channel.
const HELP_URL = 'https://github.com/Elders/event-modeler/blob/master/docs/USER-GUIDE.md';
const ISSUES_URL = 'https://github.com/Elders/event-modeler/issues';

export function PanelFooter() {
  return (
    <footer className="panel-footer">
      <a className="panel-footer-link" href={HELP_URL} target="_blank" rel="noreferrer">
        Help
      </a>
      <span className="panel-footer-sep" aria-hidden="true">
        ·
      </span>
      <a className="panel-footer-link" href={ISSUES_URL} target="_blank" rel="noreferrer">
        Report an issue
      </a>
    </footer>
  );
}
