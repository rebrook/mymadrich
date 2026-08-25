/**
 * TimeSelect
 *
 * Three plain <select> elements (hour / minute / AM-PM) that stand in
 * for a native <input type="time">. Minutes are restricted to 15-minute
 * increments, and because these are <select> elements (not a spinner),
 * there is no scroll-wheel wraparound at the top/bottom of the list.
 *
 * Value in/out is the same "HH:MM" 24-hour string the rest of the app
 * already uses (e.g. from handleNextTimeChange), so no other code needs
 * to change.
 */

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1)); // '1'..'12'
const MINUTES = ['00', '15', '30', '45'];
const PERIODS = ['AM', 'PM'];

function parseValue(value) {
  if (!value) return { hour12: '', minute: '', period: '' };
  const [hhStr, mmStr] = value.split(':');
  const hh = parseInt(hhStr, 10);
  if (Number.isNaN(hh)) return { hour12: '', minute: '', period: '' };
  const period = hh < 12 ? 'AM' : 'PM';
  let hour12 = hh % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12: String(hour12), minute: mmStr || '', period };
}

function combine(hour12, minute, period) {
  if (!hour12 || !minute || !period) return '';
  let hh = parseInt(hour12, 10) % 12;
  if (period === 'PM') hh += 12;
  return `${String(hh).padStart(2, '0')}:${minute}`;
}

export default function TimeSelect({ value, onChange, disabled = false, ariaLabelPrefix = 'Time' }) {
  const { hour12, minute, period } = parseValue(value);

  function handleHourChange(e) {
    onChange(combine(e.target.value, minute, period));
  }

  function handleMinuteChange(e) {
    onChange(combine(hour12, e.target.value, period));
  }

  function handlePeriodChange(e) {
    onChange(combine(hour12, minute, e.target.value));
  }

  return (
    <div className="time-select-group">
      <select
        className="input time-select-hour"
        value={hour12}
        onChange={handleHourChange}
        disabled={disabled}
        aria-label={`${ariaLabelPrefix} hour`}
      >
        <option value="">--</option>
        {HOURS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>

      <select
        className="input time-select-minute"
        value={minute}
        onChange={handleMinuteChange}
        disabled={disabled}
        aria-label={`${ariaLabelPrefix} minutes`}
      >
        <option value="">--</option>
        {MINUTES.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>

      <select
        className="input time-select-period"
        value={period}
        onChange={handlePeriodChange}
        disabled={disabled}
        aria-label={`${ariaLabelPrefix} AM or PM`}
      >
        <option value="">--</option>
        {PERIODS.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
    </div>
  );
}
