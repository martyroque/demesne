import "./App.css";
import { Chat } from "./components/Chat";
import { ChatSidebar } from "./components/ChatSidebar";
import { Settings } from "./components/Settings";

function App() {
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <ChatSidebar />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "20px",
            borderBottom: "1px solid #333",
          }}
        >
          <h1 style={{ margin: 0 }}>🏛️ Zion Network Node</h1>
          <Settings />
        </div>

        <Chat />
      </div>
    </div>
  );
}

export default App;
