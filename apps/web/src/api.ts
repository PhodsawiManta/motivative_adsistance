import type { Settings, ContextSnapshot } from '../../../packages/shared/src/schema';
import type { Memory, Session } from '../../../packages/database/src/schema';
export type { Settings, Memory, Session };
export type AIProblem = { code: string; message: string };
export type AIStatus = {
  configured: boolean;
  enabled: boolean;
  model: string | null;
  baseUrl: string | null;
  problem: AIProblem | null;
};
let token = '';
const connectionError =
  'เชื่อมต่อระบบในเครื่องไม่ได้ ตรวจสอบว่าเปิด npm run dev หรือ npm run dev:api อยู่';
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-local-token': token },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error(connectionError);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      response.ok
        ? 'ระบบในเครื่องส่งคำตอบไม่ถูกต้อง ตรวจสอบหน้าต่างเทอร์มินัลแล้วลองอีกครั้ง'
        : `${connectionError} (HTTP ${response.status})`,
    );
  }
  if (!response.ok)
    throw new Error(
      typeof data?.error === 'string' ? data.error : `ดำเนินการไม่สำเร็จ (HTTP ${response.status})`,
    );
  return data;
}
export type Bootstrap = {
  token: string;
  settings: Settings;
  provider: { configured: boolean; model: string | null; baseUrl: string | null };
  collector: { running: boolean; error: string | null };
};
export async function bootstrap() {
  const result = await api<Bootstrap>('/bootstrap');
  token = result.token;
  return result;
}
export type Notice = {
  id: string;
  content: string;
  status: string;
  createdAt: string;
  score: number;
  explanation: { reason: string[]; blocked: string[]; factors: Record<string, number> };
  feedback: { type: string; createdAt: string }[];
};
export type Dashboard = {
  context: ContextSnapshot;
  timeline: Session[];
  usage: Record<string, number>;
  memories: Memory[];
  notifications: Notice[];
  settings: Settings;
  collector: { running: boolean; error: string | null };
};
export const time = (value: string) =>
  new Date(value).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
export const minutes = (ms: number) => `${Math.round(ms / 60000)} นาที`;
