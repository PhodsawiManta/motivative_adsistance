const labels: Record<string, string> = {
  ALL: 'ทั้งหมด',
  GOAL: 'เป้าหมาย',
  TASK: 'งาน',
  COMMITMENT: 'สิ่งที่ตั้งใจไว้',
  IDEA: 'ไอเดีย',
  INTEREST: 'ความสนใจ',
  REMINDER: 'เรื่องที่ให้เตือน',
  PREFERENCE: 'ความชอบ',
  CONTEXT: 'บริบท',
  active: 'กำลังดำเนินการ',
  inactive: 'พักไว้',
  stale: 'ไม่ได้อัปเดตนาน',
  possibly_abandoned: 'อาจไม่ได้ทำต่อ',
  completed: 'เสร็จแล้ว',
  archived: 'เก็บเข้าคลัง',
  pending: 'รอส่ง',
  sent: 'ส่งแล้ว',
  opened: 'เปิดแล้ว',
  dismissed: 'ปิดแล้ว',
  snoozed: 'เลื่อนเตือน',
  failed: 'ส่งไม่สำเร็จ',
  suppressed: 'งดแจ้งเตือน',
  activity: 'กิจกรรม',
  interpretations: 'ผลวิเคราะห์',
  conversations: 'บทสนทนา',
  all: 'ข้อมูลทั้งหมด',
  INFERENCE: 'ข้อสันนิษฐาน',
  OBSERVATION: 'ข้อมูลที่สังเกตได้',
  USER_STATEMENT: 'ข้อความที่คุณบอก',
  'AI response': 'คำตอบจาก AI',
  'local mode': 'โหมดในเครื่อง',
  'local fallback': 'ใช้ระบบในเครื่องแทน',
  'local action': 'ดำเนินการในเครื่อง',
  STRONG_CANDIDATE: 'เหมาะสำหรับแจ้งเตือน',
  WEAK_CANDIDATE: 'เก็บไว้พิจารณา',
  SUPPRESS: 'งดแจ้งเตือน',
  related_project_reopened: 'กลับมาเปิดโครงการที่เกี่ยวข้อง',
  related_project_opened: 'เปิดโครงการที่เกี่ยวข้อง',
  deadline_approaching: 'ใกล้ถึงกำหนด',
  no_recent_matching_activity: 'ไม่พบกิจกรรมที่เกี่ยวข้องช่วงนี้',
  relevance: 'ความเกี่ยวข้อง',
  contextMatch: 'ความสอดคล้องกับกิจกรรม',
  timing: 'จังหวะเวลา',
  urgency: 'ความเร่งด่วน',
  historicalSuccess: 'การตอบรับที่ผ่านมา',
  inactivitySinceProgress: 'ระยะเวลาที่ไม่พบกิจกรรม',
  confidence: 'ความมั่นใจ',
  interruptionCost: 'ผลกระทบจากการรบกวน',
  notificationFatigue: 'ความถี่ในการรบกวน',
  'Notifications disabled': 'ปิดการแจ้งเตือนอยู่',
  'Quiet hours': 'อยู่ในช่วงห้ามรบกวน',
  'Daily notification budget reached': 'ครบจำนวนการแจ้งเตือนประจำวันแล้ว',
  'Minimum notification interval': 'ยังไม่ถึงระยะห่างขั้นต่ำ',
  'Per-goal cooldown': 'พักการเตือนเป้าหมายเดิม',
  'Goal snoozed': 'เลื่อนการเตือนเป้าหมายนี้ไว้',
  'Dismissal cooldown': 'พักหลังปิดการเตือน',
  'No fresh activity context': 'ยังไม่มีกิจกรรมล่าสุด',
  'Computer is idle': 'ไม่ได้ใช้งานคอมพิวเตอร์',
  'Fullscreen application': 'กำลังใช้แอปเต็มหน้าจอ',
  'Rapid application switching': 'สลับแอปถี่',
  'Recently returned from idle': 'เพิ่งกลับมาใช้งาน',
  'Possible meeting, presentation or video': 'อาจกำลังประชุม นำเสนอ หรือดูวิดีโอ',
  'No current project match': 'ไม่พบโครงการที่เกี่ยวข้องในขณะนี้',
  'Previous matching activity exists': 'เคยมีกิจกรรมที่เกี่ยวข้อง',
  'No older matching session found': 'ไม่พบช่วงการใช้งานเดิมที่เกี่ยวข้อง',
  'Timing: idle': 'สถานะขณะประเมิน: ไม่ได้ใช้งาน',
  'Timing: active': 'สถานะขณะประเมิน: กำลังใช้งาน',
  'Notification budget allows an interruption': 'ยังอยู่ในขอบเขตการแจ้งเตือนที่ตั้งไว้',
  notification_opened: 'เปิดแล้ว',
  notification_dismissed: 'ปิดแล้ว',
  notification_snoozed: 'เลื่อนเตือนแล้ว',
  delivery_failed: 'ส่งไม่สำเร็จ',
  expired: 'หมดอายุ',
};
export const label = (value: string): string => {
  if (labels[value]) return labels[value];
  if (value.startsWith('User statement: '))
    return value.replace('User statement: ', 'สิ่งที่คุณบอก: ');
  if (value.startsWith('Observed foreground application: '))
    return value
      .replace('Observed foreground application: ', 'แอปที่ใช้งาน: ')
      .replace('; lexical match is tentative', ' · ความเชื่อมโยงจากข้อความเป็นเพียงข้อสันนิษฐาน');
  if (value.includes('; ')) return value.split('; ').map(label).join(' · ');
  return value;
};

const problems: Record<string, string> = {
  disabled: 'AI ในแชตปิดอยู่ เลือก “เปิดใช้ AI ในแชต” ในหน้าตั้งค่า แล้วกดบันทึกการตั้งค่า',
  not_configured:
    'ยังไม่ได้ตั้งค่าโมเดล AI ตั้งค่า LLM_BASE_URL, LLM_MODEL และ LLM_API_KEY ใน .env แล้วเริ่มแอปใหม่',
  unavailable:
    'เชื่อมต่อผู้ให้บริการ AI ไม่ได้ ตรวจสอบ LLM_BASE_URL และว่าเซิร์ฟเวอร์เปิดใช้งานอยู่',
  timeout: 'ผู้ให้บริการ AI ใช้เวลาตอบนานเกินไป กรุณาลองอีกครั้ง',
  authentication: 'ผู้ให้บริการไม่ยอมรับ API key กรุณาตรวจสอบ LLM_API_KEY',
  permission: 'API key นี้ไม่มีสิทธิ์ใช้ผู้ให้บริการหรือโมเดลที่เลือก',
  not_found: 'ไม่พบที่อยู่ API หรือโมเดล ตรวจสอบ LLM_BASE_URL และ LLM_MODEL',
  invalid_request: 'ผู้ให้บริการไม่ยอมรับคำขอ ตรวจสอบว่าโมเดลรองรับรูปแบบคำขอและผลลัพธ์ JSON',
  invalid_output: 'รูปแบบคำตอบจาก AI ไม่ถูกต้องหรือว่างเปล่า ระบบจะใช้กฎในเครื่องเมื่อทำได้',
  rate_limit: 'ถึงขีดจำกัดการใช้งานหรือโควตาแล้ว กรุณาตรวจสอบบัญชีผู้ให้บริการ',
  provider_error: 'ผู้ให้บริการ AI เกิดข้อผิดพลาด กรุณาลองใหม่ภายหลัง',
};
export const problemText = (problem: { code: string; message: string }) =>
  problems[problem.code] ?? problem.message;
