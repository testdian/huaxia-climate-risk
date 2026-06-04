import type { ThemeConfig } from 'antd';
import { tokens } from './tokens';

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: tokens.color.primary,
    colorSuccess: tokens.color.success,
    colorWarning: tokens.color.warning,
    colorError: tokens.color.error,
    colorInfo: tokens.color.info,
    colorText: tokens.color.textPrimary,
    colorTextSecondary: tokens.color.textSecondary,
    colorTextDisabled: tokens.color.textDisabled,
    colorTextPlaceholder: tokens.color.textPlaceholder,
    colorBorder: tokens.color.border,
    colorBgContainer: tokens.color.contentBg,
    colorBgLayout: tokens.color.pageBg,
    borderRadius: tokens.radius.sm,
    borderRadiusLG: tokens.radius.lg,
    fontFamily: tokens.font.family,
    fontSize: tokens.font.size.base,
    controlHeight: 32,
    controlHeightLG: 40,
  },
  components: {
    Layout: {
      siderBg: tokens.color.sidebarBg,
      triggerBg: tokens.color.sidebarBg,
    },
    Menu: {
      darkItemBg: tokens.color.sidebarBg,
      darkSubMenuItemBg: tokens.color.sidebarBg,
      darkItemSelectedBg: tokens.color.sidebarActive,
      darkItemHoverBg: 'rgba(52, 119, 107, 0.35)',
    },
    Button: {
      primaryShadow: 'none',
      defaultShadow: 'none',
      borderRadius: tokens.radius.sm,
      borderRadiusLG: tokens.radius.lg,
      paddingInline: 16,
    },
    Table: {
      headerBg: tokens.color.fill,
      headerColor: tokens.color.textPrimary,
      rowHoverBg: tokens.color.primaryBg,
    },
    Input: {
      activeBorderColor: tokens.color.primary,
      hoverBorderColor: tokens.color.primaryHover,
    },
    Select: {
      optionSelectedBg: tokens.color.primaryBg,
      optionSelectedColor: tokens.color.primary,
    },
    Steps: {
      colorPrimary: tokens.color.primary,
    },
    Pagination: {
      itemActiveBg: tokens.color.primaryBg,
    },
    Tabs: {
      inkBarColor: tokens.color.primary,
      itemSelectedColor: tokens.color.primary,
      itemHoverColor: tokens.color.primaryHover,
    },
  },
};
