import { createTheme, MantineColorsTuple } from '@mantine/core';

// 匹配项目现有的深空暗色主题
const brand: MantineColorsTuple = [
  '#e6fcf3',  // 0 lightest
  '#d0f5e3',  // 1
  '#a3e9c8',  // 2
  '#72dcab',  // 3
  '#4ad192',  // 4
  '#10B981',  // 5  ← 主色（accent-green）
  '#0da472',  // 6
  '#098c60',  // 7
  '#06744e',  // 8
  '#035c3d',  // 9 darkest
];

export const theme = createTheme({
  primaryColor: 'brand',
  colors: { brand },
  fontFamily: '"Inter", "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  defaultRadius: 'md',
  cursorType: 'pointer',
  other: {
    bgPrimary: '#0F172A',
    bgSecondary: '#1E293B',
    bgTertiary: '#334155',
  },
});
