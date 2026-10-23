import React from 'react';

/**
 * Standard Reusable Design System Primitives
 * Following Sanjeevani Lekh / Field-to-Record Design Specifications
 */

// 1. Button Primitive
export function Button({
  children,
  variant = 'primary', // 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
  size = 'md', // 'sm' | 'md' | 'lg'
  icon: Icon,
  iconRight: IconRight,
  disabled = false,
  loading = false,
  fullWidth = false,
  className = '',
  style = {},
  onClick,
  type = 'button',
  title,
  ariaLabel,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel || (typeof children === 'string' ? children : undefined)}
      className={`ui-btn ui-btn-${variant} ui-btn-${size} ${fullWidth ? 'ui-btn-full' : ''} ${className}`}
      style={style}
      {...props}
    >
      {loading ? (
        <span className="ui-btn-spinner" aria-hidden="true" />
      ) : (
        Icon && <Icon className="ui-btn-icon" size={size === 'sm' ? 14 : size === 'lg' ? 20 : 17} strokeWidth={2} />
      )}
      <span className="ui-btn-label">{children}</span>
      {IconRight && !loading && (
        <IconRight className="ui-btn-icon-right" size={size === 'sm' ? 14 : size === 'lg' ? 20 : 17} strokeWidth={2} />
      )}
    </button>
  );
}

// 2. StatusDot with optional live pulse
export function StatusDot({
  color = 'neutral', // 'green' | 'blue' | 'teal' | 'amber' | 'red' | 'neutral'
  pulse = false,
  size = 8,
  className = '',
}) {
  return (
    <span
      className={`ui-status-dot dot-${color} ${pulse ? 'dot-pulse' : ''} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

// 3. Pill / Badge Component
export function Badge({
  children,
  variant = 'neutral', // 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger'
  icon: Icon,
  dotColor,
  pulseDot = false,
  interactive = false,
  onClick,
  className = '',
  style = {},
  title,
  ...props
}) {
  const Component = interactive ? 'button' : 'div';
  return (
    <Component
      className={`ui-badge ui-badge-${variant} ${interactive ? 'ui-badge-interactive' : ''} ${className}`}
      style={style}
      onClick={interactive ? onClick : undefined}
      title={title}
      {...props}
    >
      {dotColor && <StatusDot color={dotColor} pulse={pulseDot} />}
      {Icon && <Icon size={13} strokeWidth={2} className="ui-badge-icon" />}
      <span className="ui-badge-text">{children}</span>
    </Component>
  );
}

// 4. Card Primitive
export function Card({
  children,
  variant = 'surface', // 'surface' | 'surface-2' | 'interactive' | 'warning' | 'success'
  className = '',
  style = {},
  onClick,
  ...props
}) {
  return (
    <div
      className={`ui-card ui-card-${variant} ${onClick ? 'ui-card-clickable' : ''} ${className}`}
      style={style}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
}

// 5. SegmentedControl Primitive
export function SegmentedControl({
  options = [], // [{ value: 'tap', label: '...', icon: Icon }]
  value,
  onChange,
  className = '',
  ariaLabel = 'Select option',
}) {
  return (
    <div className={`ui-segmented-control ${className}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const isSelected = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={`ui-segment-btn ${isSelected ? 'active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {Icon && <Icon size={15} strokeWidth={2} />}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// 6. EmptyState Primitive
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}) {
  return (
    <div className={`ui-empty-state ${className}`}>
      {Icon && (
        <div className="ui-empty-icon-wrap">
          <Icon size={32} strokeWidth={1.5} />
        </div>
      )}
      {title && <h4 className="ui-empty-title">{title}</h4>}
      {description && <p className="ui-empty-desc">{description}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}

// 7. AudioWaveform (animated visual frequency bars during recording)
export function AudioWaveform({ active = true, barCount = 7, color = 'var(--accent)' }) {
  const heights = [35, 65, 95, 80, 50, 75, 40];
  return (
    <div className={`ui-waveform ${active ? 'active' : ''}`} aria-hidden="true">
      {Array.from({ length: barCount }).map((_, i) => (
        <span
          key={i}
          className="waveform-bar"
          style={{
            '--max-h': `${heights[i % heights.length]}%`,
            '--delay': `${(i * 0.12).toFixed(2)}s`,
            backgroundColor: color,
          }}
        />
      ))}
    </div>
  );
}
