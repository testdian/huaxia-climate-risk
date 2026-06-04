/**
 * 碳云 Design System 衍生 Token
 * 主色：取自「查询」按钮取样 #34776B（非 brand-1 #00BF8F）
 */
export const tokens = {
  color: {
    primary: '#34776B',
    primaryHover: '#4A867B',
    primaryActive: '#2D665C',
    primaryBg: '#E8F3F1',

    textPrimary: '#142528',
    textSecondary: '#6C757D',
    textDisabled: '#ADB5BD',
    textPlaceholder: '#CED4DA',
    textInverse: '#FFFFFF',

    border: '#DEE2E6',
    borderLight: '#E9ECEF',
    fill: '#F2F2F2',
    pageBg: '#F8F9FA',
    contentBg: '#FFFFFF',

    sidebarBg: '#1A3D37',
    sidebarActive: '#34776B',

    success: '#2EBF91',
    warning: '#F39A3E',
    error: '#C0392B',
    info: '#3361D1',
  },
  font: {
    family:
      "'PingFang SC', 'Microsoft YaHei', Roboto, 'Helvetica Neue', Arial, sans-serif",
    size: {
      xs: 12,
      sm: 14,
      base: 14,
      lg: 16,
      xl: 18,
      h1: 24,
      h2: 20,
      h3: 18,
    },
  },
  radius: {
    sm: 4,
    md: 6,
    lg: 8,
  },
  spacing: {
    unit: 4,
    base: 16,
  },
  layout: {
    sidebarWidth: 220,
    headerHeight: 56,
    contentMaxWidth: 1440,
    minWidth: 1280,
  },
} as const;
