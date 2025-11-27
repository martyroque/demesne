import { Chat } from './components/Chat'
import './App.css'

function App() {
  return (
    <div style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>
        🏛️ Zion Network Node
      </h1>
      <Chat />
    </div>
  );
}

export default App
