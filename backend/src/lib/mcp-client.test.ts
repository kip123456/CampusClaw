import { describe, it, expect } from 'vitest';
import { parseSseBuffer, joinUrl } from './mcp-client';

describe('parseSseBuffer', () => {
  it('parses single endpoint event', () => {
    const buf = 'event: endpoint\ndata: /mcp/message?sessionId=abc\n\n';
    const { events, rest } = parseSseBuffer(buf);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('endpoint');
    expect(events[0].data).toBe('/mcp/message?sessionId=abc');
    expect(rest).toBe('');
  });

  it('parses message event without explicit event type (defaults to message)', () => {
    const buf = 'data: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n';
    const { events } = parseSseBuffer(buf);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('message');
    expect(events[0].data).toBe('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}');
  });

  it('parses multiple data lines joined with newline', () => {
    const buf = 'event: endpoint\ndata: /first\ndata: /second\n\n';
    const { events } = parseSseBuffer(buf);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('/first\n/second');
  });

  it('leaves trailing block as rest when incomplete', () => {
    const buf = 'event: endpoint\ndata: /mcp/message\n\npartial';
    const { events, rest } = parseSseBuffer(buf);
    expect(events).toHaveLength(1);
    expect(rest).toBe('partial');
  });

  it('parses multiple events separated by blank lines', () => {
    const buf = 'event: endpoint\ndata: /ep\n\n' +
                'event: message\ndata: {"id":1}\n\n';
    const { events } = parseSseBuffer(buf);
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe('endpoint');
    expect(events[1].event).toBe('message');
  });

  it('handles carriage returns (\\r\\n)', () => {
    const buf = 'event: endpoint\r\ndata: /ep\r\n\r\n';
    const { events } = parseSseBuffer(buf);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('/ep');
  });

  it('skips comment lines starting with colon', () => {
    const buf = ': keepalive\nevent: endpoint\ndata: /ep\n\n';
    const { events } = parseSseBuffer(buf);
    expect(events).toHaveLength(1);
  });
});