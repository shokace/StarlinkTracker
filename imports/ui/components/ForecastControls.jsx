import {
  formatTimelineDateTimeLabel,
  formatTimelineOffsetLabel,
} from "/imports/ui/lib/formatters";

export function ForecastControls({
  isForecastMode,
  isPlaying,
  forecastOffsetMs,
  forecastHorizonMs,
  displayTime,
  onEnterForecastMode,
  onReturnLive,
  onTogglePlay,
  onSeek,
}) {
  if (!isForecastMode) {
    return (
      <div className="forecast-controls forecast-controls--collapsed">
        <button className="forecast-live-button" onClick={onEnterForecastMode}>
          LIVE
        </button>
      </div>
    );
  }

  return (
    <div className="forecast-controls">
      <div className="forecast-controls__row">
        <button className="forecast-live-button" onClick={onReturnLive}>
          LIVE
        </button>
        <button className="forecast-play-button" onClick={onTogglePlay}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <div className="forecast-meta">
          <span className="forecast-meta__offset">
            Forecast {formatTimelineOffsetLabel(forecastOffsetMs)}
          </span>
          <span className="forecast-meta__time">{formatTimelineDateTimeLabel(displayTime)}</span>
        </div>
      </div>

      <input
        className="forecast-slider"
        type="range"
        min="0"
        max={forecastHorizonMs}
        step={60000}
        value={forecastOffsetMs}
        onChange={(event) => onSeek(Number(event.target.value))}
      />

      <div className="forecast-scale">
        <span>Now</span>
        <span>+24h</span>
      </div>
    </div>
  );
}
