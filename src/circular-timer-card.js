import * as d3 from "d3";
import { css, html, LitElement, svg } from "lit";
import { repeat } from "lit/directives/repeat.js";
import pkg from "../package.json";

class CircularTimerCard extends LitElement {
	constructor() {
		super();

		// Defaults
		this._bins = 36;
		this._padAngle = 1;
		this._cornerRadius = 4;
		this._defaultTimerFill = getComputedStyle(
			document.documentElement,
		).getPropertyValue("--primary-color");
		this._gradientColors = [this._defaultTimerFill, this._defaultTimerFill];
		this._defaultTimerEmptyFill = "#fdfdfd00";
		this._secondaryInfoSize;
		this._layout = "circle";

		this._name = "use_entity_friendly_name";
		this._nameEntity = undefined;
		this._nameAttribute = undefined;
		this._nameMaxChars = undefined;
		// Shrink text that is too wide for the ring's hole (circle layout).
		// Optional: scale the ring to a session budget kept in two number
		// entities (minutes) instead of the timer's own duration, so a timer
		// restarted to add time keeps a continuous ring.
		this._plannedEntity = undefined;
		this._addedEntity = undefined;
		this._fitText = true;
		this._fitMinScale = 0.4;
		this._fit = { countdown: 1, "timer-name": 1 };
		this._timeFormat = "hh:mm:ss";
		this._icon = "use_entity_icon";
		this._primaryInfo = "name";
		this._secondaryInfo = "timer";
		this._direction = "countdown";
		this._tapAction = "toggle";
		this._holdAction = "more_info";
		this._doubleTapAction = "cancel";

		this._colorState = false;
		this._stateColor = getComputedStyle(
			document.documentElement,
		).getPropertyValue("--primary-text-color");

		// To update card every half second
		this._timeUpdater = 1;
		setInterval(() => {
			this._timeUpdater++;
		}, 500);

		// Event listener bindings (https://developers.home-assistant.io/blog/2023/07/07/action-event-custom-cards/)

		this.addEventListener("click", this._tap);

		this._mouseIsDown = false;
		this._mouseIsDownTriggered = false;
		this._doubleClickTriggered = false;
		this.addEventListener("mousedown", this._mousedown);
		this.addEventListener("touchstart", this._mousedown);
		this.addEventListener("mouseup", this._mouseup);
		this.addEventListener("touchend", this._mouseup);

		this.addEventListener("dblclick", this._double_tap);

		////
	}

	static get properties() {
		return {
			_config: {},
			_timeUpdater: {},
			_fit: {},
		};
	}

	setConfig(config) {
		if (!config.entity) {
			throw new Error("You need to provide entity!");
		}

		var domain = config.entity.split(".")[0];
		if (domain !== "timer") {
			throw new Error("Provided entity is not a timer!");
		}

		// Define the action config
		this._actionConfig = {
			entity: config.entity,
			hold_action: {
				action: "more-info",
				start_listening: true,
			},
		};

		if (config.layout) {
			if (config.layout === "minimal") {
				this._layout = "minimal";
			}
		}

		if (config.bins) {
			this._bins = config.bins;
		}
		this._seqmentSize = 360 / this._bins;

		if (config.pad_angle) {
			this._padAngle = config.pad_angle;
		}

		if (config.corner_radius) {
			this._cornerRadius = config.corner_radius;
		}

		// `color` is either a list of color strings (evenly spaced, smoothed
		// with a B-spline as before) or a list of stops:
		//   - { color: "#e74c3c", at: 0 }     # 0 = empty timer
		//   - { color: "#2ecc71", at: 100 }   # 100 = full timer
		// Stops are joined with straight RGB blends, so each color is hit
		// exactly at its position.
		this._colorStops = undefined;
		if (config.color) {
			const colors = Array.isArray(config.color) ? config.color : [config.color];
			if (colors.some((c) => typeof c === "object" && c !== null)) {
				this._colorStops = this._parseColorStops(colors);
			} else if (colors.length === 1) {
				this._gradientColors = [colors[0], colors[0]];
			} else {
				this._gradientColors = colors;
			}
		}

		if (config.color_state) {
			this._colorState = config.color_state;
		}

		if (config.empty_bar_color) {
			this._defaultTimerEmptyFill = config.empty_bar_color;
		}

		if (config.secondary_info_size) {
			this._secondaryInfoSize = config.secondary_info_size;
		} else {
			if (config.layout === "minimal") {
				this._secondaryInfoSize = "80%";
			} else {
				this._secondaryInfoSize = "50%";
			}
		}

		if (config.name) {
			this._name = config.name;
		}

		// Take the displayed name from another entity (e.g. an input_text),
		// optionally from one of its attributes. Falls back to `name`.
		if (config.name_entity) {
			this._nameEntity = config.name_entity;
		}
		if (config.name_attribute) {
			this._nameAttribute = config.name_attribute;
		}
		if (config.name_max_chars) {
			this._nameMaxChars = Number(config.name_max_chars);
		}

		if (config.planned_entity) {
			this._plannedEntity = config.planned_entity;
		}
		if (config.added_entity) {
			this._addedEntity = config.added_entity;
		}

		if (config.fit_text !== undefined) {
			this._fitText = config.fit_text !== false;
		}
		if (config.fit_min_scale) {
			this._fitMinScale = Math.min(1, Math.max(0.1, Number(config.fit_min_scale)));
		}

		if (config.time_format) {
			this._timeFormat = config.time_format;
		}

		if (config.icon) {
			this._icon = config.icon;
		}

		if (config.primary_info) {
			this._primaryInfo = config.primary_info;
		}

		if (config.secondary_info) {
			this._secondaryInfo = config.secondary_info;
		}

		if (config.direction) {
			this._direction = config.direction;
		}

		if (config.tap_action) {
			this._tapAction = config.tap_action;
		}

		if (config.hold_action) {
			this._holdAction = config.hold_action;
		}

		if (config.double_tap_action) {
			this._doubleTapAction = config.double_tap_action;
		}

		this._colorScale = this._colorStops
			? this._makeStopScale(this._colorStops)
			: d3.scaleSequential(d3.interpolateRgbBasis(this._gradientColors));
		this._arc = d3
			.arc()
			.innerRadius(30)
			.outerRadius(48)
			.startAngle((d) => {
				return this._toRadians(d.start);
			})
			.endAngle((d) => {
				return this._toRadians(d.end);
			})
			.cornerRadius(this._cornerRadius)
			.padAngle(this._toRadians(this._padAngle));

		this._arcData = this._generateArcData();
		this._barData = this._generateBarData();

		this._config = config;
	}

	render() {
		if (!this.hass || !this._config) {
			return html``;
		}

		this._stateObj = this.hass.states[this._config.entity];
		if (!this._stateObj) {
			return html` <ha-card>Unknown entity: ${this._config.entity}</ha-card> `;
		}

		var name = this._resolveName();

		var icon;
		var icon_style;
		if (this._icon == "use_entity_icon") {
			icon = this._stateObj.attributes.icon;
		} else if (this._icon == "none") {
			icon = "";
			icon_style = "display:none;";
		} else {
			icon = this._icon;
		}

		var a = this._stateObj.attributes.duration.split(":");
		var d_sec = +a[0] * 60 * 60 + +a[1] * 60 + +a[2];
		// While running or paused, the ring is scaled to planned + added
		// minutes when those entities are configured and a session is open.
		if (
			this._stateObj.state == "active" ||
			this._stateObj.state == "paused"
		) {
			const budget = this._sessionSeconds();
			if (budget > 0) {
				d_sec = budget;
			}
		}
		var rem_sec;
		if (this._stateObj.state == "active") {
			if (this._direction == "countup") {
				rem_sec =
					d_sec -
					(Date.parse(this._stateObj.attributes.finishes_at) - new Date()) /
						1000;
			} else {
				rem_sec =
					(Date.parse(this._stateObj.attributes.finishes_at) - new Date()) /
					1000;
			}
		} else {
			if (this._stateObj.state == "paused") {
				var a1 = this._stateObj.attributes.remaining.split(":");
				if (this._direction == "countup") {
					rem_sec = d_sec - (+a1[0] * 60 * 60 + +a1[1] * 60 + +a1[2]);
				} else {
					rem_sec = +a1[0] * 60 * 60 + +a1[1] * 60 + +a1[2];
				}
			} else {
				rem_sec = d_sec;
			}
		}
		var proc = Math.min(1, Math.max(0, rem_sec / d_sec));

		var limitBin = Math.floor(this._bins * proc);
		var colorData = this._generateArcColorData(limitBin);
		var textColor = this._getTextColor(proc);

		var display_rem_sec = this._getTimeString(rem_sec);

		var primary_info;
		if (this._primaryInfo == "none") {
			primary_info = "";
		} else if (this._primaryInfo == "timer") {
			primary_info = display_rem_sec;
		} else {
			primary_info = name;
		}

		var secondary_info;
		if (this._secondaryInfo == "none") {
			secondary_info = "";
		} else if (this._secondaryInfo == "name") {
			secondary_info = name;
		} else {
			secondary_info = display_rem_sec;
		}

		if (this._layout === "minimal") {
			return html`
        <ha-card>
          <div class="header">
            <div class="icon" style="${icon_style}">
              <ha-icon
                icon="${icon}"
                style="${this._colorState ? `color: ${textColor};"` : `""`};"
              ></ha-icon>
            </div>
            <div class="info">
              <span class="primary">${primary_info}</span>
              <span
                class="secondary"
                style="font-size:${this._secondaryInfoSize};"
                >${secondary_info}</span
              >
            </div>
          </div>
          <svg viewBox="0 0 100 10.2">
            <g transform="translate(0,0)">
              ${repeat(
								this._barData,
								(d) => d.id,
								(d, index) =>
									svg`<rect x=${d.x} y=${d.y} width=${d.width} height=${d.height} rx="1" fill=${colorData[index]} />`,
							)}
            </g>
          </svg>
        </ha-card>
      `;
		} else {
			return html`
        <ha-card>
          <svg viewBox="0 0 100 100">
            <g transform="translate(50,50)">
              ${repeat(
								this._arcData,
								(d) => d.id,
								(d, index) =>
									svg`<path class="arc" d=${d.arc} fill=${colorData[index]} />`,
							)}
            </g>
            <g transform="translate(50,50)">
              <text
                id="countdown"
                text-anchor="middle"
                dominant-baseline="central"
                fill=${textColor}
                style="font-size:calc(85% * ${this._fit.countdown});"
              >
                ${secondary_info}
              </text>
            </g>
            <g transform="translate(50,62)">
              <text
                id="timer-name"
                text-anchor="middle"
                dominant-baseline="central"
                fill="var(--secondary-text-color)"
                style="font-size:calc(${this._secondaryInfoSize} * ${this._fit["timer-name"]});"
              >
                ${primary_info}
              </text>
            </g>
          </svg>
        </ha-card>
      `;
		}
	}

	// Keep the center text and the name inside the ring. Widths are measured
	// in SVG units, so card size does not matter; the scale only ever shrinks
	// (down to fit_min_scale) and grows back to 1 when the text gets shorter.
	updated() {
		if (!this._fitText || this._layout !== "circle" || !this.renderRoot) {
			return;
		}
		const limits = { countdown: 52, "timer-name": 48 };
		var next = null;
		for (const [id, maxWidth] of Object.entries(limits)) {
			const el = this.renderRoot.querySelector(`#${id}`);
			if (!el || typeof el.getBBox !== "function") {
				continue;
			}
			const width = el.getBBox().width;
			if (!width) {
				continue;
			}
			const current = this._fit[id];
			const wanted = Math.max(
				this._fitMinScale,
				Math.min(1, (current * maxWidth) / width),
			);
			if (Math.abs(wanted - current) > 0.01) {
				next = next || { ...this._fit };
				next[id] = wanted;
			}
		}
		if (next) {
			this._fit = next;
		}
	}

	_generateArcData() {
		var data = [];
		for (var i = 0; i < this._bins; i++) {
			data.push({
				arc: this._arc({
					start: i * this._seqmentSize,
					end: (i + 1) * this._seqmentSize,
				}),
				id: i,
			});
		}
		return data;
	}

	_generateBarData() {
		var pad = 1;

		var width = (100 + pad) / this._bins - pad;
		var height = 10;

		var data = [];
		for (var i = 0; i < this._bins; i++) {
			var x = i * (width + pad);
			var y = 0;

			data.push({ x: x, y: y, width: width, height: height, id: i });
		}
		return data;
	}

	_generateArcColorData(limitBin) {
		var data = [];
		for (var i = 0; i < this._bins; i++) {
			var color;
			if (i < limitBin) {
				color = this._colorScale(i / (this._bins - 1));
			} else {
				color = this._defaultTimerEmptyFill;
			}

			data.push(color);
		}
		return data;
	}

	_getTextColor(proc) {
		if (this._colorState) {
			return this._colorScale(proc);
		} else {
			return this._stateColor;
		}
	}

	_toRadians(deg) {
		return deg * (Math.PI / 180);
	}

	// Seconds in the current session (planned + added minutes), or 0 when
	// planned_entity is not set, unavailable, or no session is open.
	_sessionSeconds() {
		if (!this._plannedEntity) {
			return 0;
		}
		const minutes = (id) => {
			const obj = id ? this.hass.states[id] : undefined;
			const n = obj ? parseFloat(obj.state) : NaN;
			return Number.isFinite(n) && n > 0 ? n : 0;
		};
		const planned = minutes(this._plannedEntity);
		return planned > 0 ? (planned + minutes(this._addedEntity)) * 60 : 0;
	}

	// Name shown on the card: name_entity (state or attribute) if set and
	// usable, else `name`, else the timer's friendly name.
	_resolveName() {
		var name;
		if (this._nameEntity) {
			const obj = this.hass.states[this._nameEntity];
			if (obj) {
				const value = this._nameAttribute
					? obj.attributes[this._nameAttribute]
					: obj.state;
				if (
					value !== undefined &&
					value !== null &&
					value !== "unknown" &&
					value !== "unavailable"
				) {
					name = String(value);
				}
			}
		}
		if (name === undefined || name === "") {
			name =
				this._name === "use_entity_friendly_name"
					? this._stateObj.attributes.friendly_name
					: this._name;
		}
		if (name === "none") {
			return "";
		}
		if (this._nameMaxChars > 0 && name.length > this._nameMaxChars) {
			name = `${name.slice(0, this._nameMaxChars - 1).trimEnd()}\u2026`;
		}
		return name;
	}

	_parseColorStops(entries) {
		const stops = entries.map((entry, i) => {
			if (typeof entry !== "object" || entry === null) {
				throw new Error(
					"When using color stops, every entry in `color` needs `color` and `at`.",
				);
			}
			const at = Number(entry.at);
			if (!entry.color || Number.isNaN(at) || at < 0 || at > 100) {
				throw new Error(
					`color[${i}] needs a \`color\` and an \`at\` between 0 (empty) and 100 (full).`,
				);
			}
			return { color: entry.color, at: at / 100 };
		});
		stops.sort((a, b) => a.at - b.at);
		return stops;
	}

	// Straight RGB blend between neighbouring stops; colors before the first
	// stop and after the last one are held flat.
	_makeStopScale(stops) {
		return (t) => {
			if (t <= stops[0].at) {
				return stops[0].color;
			}
			const last = stops[stops.length - 1];
			if (t >= last.at) {
				return last.color;
			}
			for (let i = 1; i < stops.length; i++) {
				if (t <= stops[i].at) {
					const a = stops[i - 1];
					const b = stops[i];
					const span = b.at - a.at;
					return d3.interpolateRgb(a.color, b.color)(
						span === 0 ? 1 : (t - a.at) / span,
					);
				}
			}
			return last.color;
		};
	}

	// time_format: "hh:mm:ss" (default), "mm:ss" (minutes can pass 59),
	// "auto" (h:mm:ss, or m:ss under an hour), "compact" (1h 05m / 4m 30s /
	// 45s) or "minutes" (whole minutes remaining, rounded up: 25m).
	_getTimeString(totalSeconds) {
		const total = Math.max(0, Math.floor(totalSeconds));
		const h = Math.floor(total / 3600);
		const m = Math.floor((total % 3600) / 60);
		const sec = total % 60;
		const two = (n) => n.toString().padStart(2, "0");

		switch (this._timeFormat) {
			case "mm:ss":
				return `${two(Math.floor(total / 60))}:${two(sec)}`;
			case "auto":
				return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
			case "compact":
				if (h > 0) {
					return `${h}h ${two(m)}m`;
				}
				return m > 0 ? `${m}m ${two(sec)}s` : `${sec}s`;
			case "minutes":
				return `${Math.ceil(total / 60)}m`;
			default:
				return `${two(h)}:${two(m)}:${two(sec)}`;
		}
	}

	_toggle_func() {
		const stateObj = this.hass.states[this._config.entity];
		const service = stateObj.state === "active" ? "pause" : "start";
		this.hass.callService("timer", service, { entity_id: this._config.entity });
	}

	_cancel_func() {
		const stateObj = this.hass.states[this._config.entity];
		this.hass.callService("timer", "cancel", {
			entity_id: this._config.entity,
		});
	}

	_moreInfo_func() {
		var event = new Event("hass-action", {
			bubbles: true,
			composed: true,
		});
		event.detail = {
			config: this._actionConfig,
			action: "hold",
		};
		this.dispatchEvent(event);
	}

	_tap(e) {
		if (this._mouseIsDownTriggered == false) {
			setTimeout(() => {
				if (this._doubleClickTriggered == false) {
					if (this._tapAction == "toggle") {
						this._toggle_func();
					} else if (this._tapAction == "more_info") {
						this._moreInfo_func();
					} else if (this._tapAction == "cancel") {
						this._cancel_func();
					}
				}
			}, 200);
		}
	}

	_double_tap(e) {
		this._doubleClickTriggered = true;
		if (this._doubleTapAction == "toggle") {
			this._toggle_func();
		} else if (this._doubleTapAction == "more_info") {
			this._moreInfo_func();
		} else if (this._doubleTapAction == "cancel") {
			this._cancel_func();
		}
		setTimeout(() => {
			this._doubleClickTriggered = false;
		}, 500);
	}

	_mousedown(e) {
		this._mouseIsDown = true;
		setTimeout(() => {
			if (this._mouseIsDown) {
				this._mouseIsDownTriggered = true;
				if (this._holdAction == "toggle") {
					this._toggle_func();
				} else if (this._holdAction == "more_info") {
					this._moreInfo_func();
				} else if (this._holdAction == "cancel") {
					this._cancel_func();
				}
			}
		}, 1000);
	}

	_mouseup(e) {
		setTimeout(() => {
			this._mouseIsDown = false;
			this._mouseIsDownTriggered = false;
		}, 100);
	}

	static get styles() {
		return css`
      ha-card {
        padding: 10px;
      }

      path:hover {
        opacity: 0.85;
      }
      rect:hover {
        opacity: 0.85;
      }
      #countdown {
        font-weight: 600;
        font-size: 85%;
      }
      #timer-name {
        font-weight: 600;

        text-transform: capitalize;
      }
      #compact-countdown {
        font-weight: 600;
        font-size: 35%;
      }

      .header {
        display: flex;
        padding: 0px;
        justify-content: flex-start;
        cursor: pointer;

        margin-bottom: 10px;
      }

      ha-icon {
        color: rgba(189, 189, 189, 1);
      }

      .info {
        display: flex;
        flex-direction: column;
        justify-content: center;

        font-weight: 700;

        min-width: 0;
      }

      .info span {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .primary {
        color: var(--primary-text-color);

        font-size: 14px;
      }

      .secondary {
        color: var(--secondary-text-color);
        text-transform: capitalize;
      }

      .icon {
        width: 42px;
        height: 42px;

        flex-shrink: 0;

        display: flex;
        align-items: center;
        justify-content: center;

        margin-right: 10px;

        background: rgba(34, 34, 34, 0.05);
        border-radius: 500px;
      }
    `;
	}
}

customElements.define("circular-timer-card", CircularTimerCard);

console.info(
	`%c circular-timer-card | Version ${pkg.version} `,
	"color: white; font-weight: bold; background: #FF4F00",
);
