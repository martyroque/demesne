import { useStore } from 'nucleux';
import React, { useState, useEffect } from 'react';
import IntentParserService from '../services/intent-parser';
import OllamaService, { type Message } from '../services/ollama';
import HomeAssistantService, { type HAEntity } from '../services/home-assistant';

export const Chat: React.FC = () => {
  const intentParserService = useStore(IntentParserService);
  const ollamaService = useStore(OllamaService);
  const homeAssistantService = useStore(HomeAssistantService);

  // TODO: move to a store
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [entities, setEntities] = useState<HAEntity[]>([]);

  // Load HA entities on mount
  // TODO: move to a store
  useEffect(() => {
    const loadEntities = async () => {
      const states = await homeAssistantService.getStates();
      setEntities(states);
    };
    loadEntities();
  }, []);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Check if this is a home control request
      const isHomeControl = /turn|set|dim|bright|temperature|thermostat|light/i.test(input);

      if (isHomeControl) {
        // Parse intent and execute
        const entityIds = entities.map((e) => e.entity_id);
        const result = await intentParserService.parseAndExecute(input, entityIds);

        const assistantMessage: Message = {
          role: 'assistant',
          content: result.response,
        };
        setMessages((prev) => [...prev, assistantMessage]);

      } else {
        // Regular chat
        const response = await ollamaService.chat('llama3.1:8b', [
          ...messages,
          userMessage,
        ]);

        setMessages((prev) => [...prev, response.message]);
      }

    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, something went wrong.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <strong>{msg.role}:</strong> {msg.content}
          </div>
        ))}
        {loading && <div className="message assistant">Thinking...</div>}
      </div>

      <div className="input-area">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask me anything or control your home..."
        />
        <button onClick={handleSend} disabled={loading}>
          Send
        </button>
      </div>
    </div>
  );
};
