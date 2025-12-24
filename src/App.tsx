import "./App.css";
import { Chat } from "./components/Chat";
import { Settings } from "./components/Settings";

function App() {
  return (
    <div
      style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: "20px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "30px",
          gap: 10,
        }}
      >
        <h1 style={{ margin: 0 }}>🏛️ Zion Network Node</h1>
        <Settings />
      </div>
      <Chat />
    </div>
  );
}

export default App;
