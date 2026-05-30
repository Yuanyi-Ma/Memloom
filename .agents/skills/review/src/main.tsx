import React from "react";
import ReactDOM from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider, createTheme, alpha } from "@mui/material/styles";
import App from "./App";
import "./styles.css";

const theme = createTheme({
  palette: {
    mode: "light",
    background: {
      default: "#f6f8fb",
      paper: "#ffffff",
    },
    primary: {
      main: "#1f6feb",
      light: "#e8f1ff",
      dark: "#174ea6",
    },
    success: {
      main: "#168a5b",
      light: "#e9f8f0",
      dark: "#0f6b45",
    },
    warning: {
      main: "#b56a00",
      light: "#fff5df",
      dark: "#8f4e00",
    },
    error: {
      main: "#c0362c",
      light: "#fff1ef",
      dark: "#8f221b",
    },
    text: {
      primary: "#172033",
      secondary: "#647084",
    },
    divider: "#dce2ea",
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily:
      'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: { fontSize: 24, lineHeight: 1.2, fontWeight: 760, letterSpacing: 0 },
    h2: { fontSize: 22, lineHeight: 1.25, fontWeight: 760, letterSpacing: 0 },
    h3: { fontSize: 16, lineHeight: 1.35, fontWeight: 720, letterSpacing: 0 },
    body1: { fontSize: 14, lineHeight: 1.55, letterSpacing: 0 },
    body2: { fontSize: 13, lineHeight: 1.5, letterSpacing: 0 },
    button: { textTransform: "none", fontWeight: 700, letterSpacing: 0 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: "none",
          minHeight: 36,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 700,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          borderColor: "#dce2ea",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundColor: "#ffffff",
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: alpha("#1f6feb", 0.55),
          },
        },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
