import {
  ModelSessionAction,
  ModelSessionPage,
  SessionStatus,
} from "../../shared-types/model-session-config";

export const MODEL_SESSION_API_ROUTES = {
  getCurrentSession: "/model/session/current",
  getSessionById: "/model/session/:sessionId",
  startTravel: "/model/session/:sessionId/start-travel",
  shareLocation: "/model/session/:sessionId/share-location",
  arrived: "/model/session/:sessionId/arrived",
  metClient: "/model/session/:sessionId/met-client",
  paymentStatus: "/model/session/:sessionId/payment-status",
  startWork: "/model/session/:sessionId/start-work",
  workFinished: "/model/session/:sessionId/work-finished",
  separated: "/model/session/:sessionId/separated",
  emergency: "/model/session/:sessionId/emergency",
} as const;

export type ModelSessionApiRoute =
  (typeof MODEL_SESSION_API_ROUTES)[keyof typeof MODEL_SESSION_API_ROUTES];

export interface ModelSessionBaseAuthRequest {
  t: string;
}

export interface GetModelSessionCurrentQuery {
  t: string;
}

export interface GetModelSessionByIdQuery {
  sessionId: string;
  t: string;
}

export interface StartTravelRequest extends ModelSessionBaseAuthRequest {
  sessionId: string;
}

export interface ShareLocationRequest extends ModelSessionBaseAuthRequest {
  sessionId: string;
  lat: number;
  lng: number;
  accuracy_m?: number;
  source?: "gps" | "manual" | "realtime-room";
}

export interface ArrivedRequest extends ModelSessionBaseAuthRequest {
  sessionId: string;
}

export interface MetClientRequest extends ModelSessionBaseAuthRequest {
  sessionId: string;
}

export interface PaymentStatusRequest extends ModelSessionBaseAuthRequest {
  sessionId: string;
}

export interface StartWorkRequest extends ModelSessionBaseAuthRequest {
  sessionId: string;
}

export interface WorkFinishedRequest extends ModelSessionBaseAuthRequest {
  sessionId: string;
}

export interface SeparatedRequest extends ModelSessionBaseAuthRequest {
  sessionId: string;
}

export interface EmergencyRequest extends ModelSessionBaseAuthRequest {
  sessionId: string;
  message?: string;
  priority?: "high" | "critical";
}

export interface ModelSessionView {
  session_id: string;
  status: SessionStatus;
  page: ModelSessionPage;
  route: string;
  primary_action?: ModelSessionAction;
  visible_actions: ModelSessionAction[];
  disabled_actions?: ModelSessionAction[];
  client_name?: string;
  location?: string;
  meeting_point?: string;
  time_label?: string;
  duration_label?: string;
  final_payment_confirmed?: boolean;
  work_started_at?: string | null;
  finished_at?: string | null;
  model?: {
    model_id?: string;
    model_name?: string;
    memberstack_id?: string;
    telegram_id?: string;
    telegram_username?: string;
    district?: string;
    tier?: string;
    availability_status?: string;
  };
}

export interface ModelSessionReadResponse {
  ok: true;
  session: ModelSessionView;
}

export interface ModelSessionWriteResponse {
  ok: true;
  session_id: string;
  previous_status: SessionStatus;
  status: SessionStatus;
  page: ModelSessionPage;
  route: string;
  emitted_events: string[];
}

export type ModelSessionErrorCode =
  | "UNAUTHORIZED"
  | "INVALID_STATUS"
  | "PAYMENT_NOT_CONFIRMED"
  | "SESSION_NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

export interface ModelSessionErrorResponse {
  ok: false;
  code: ModelSessionErrorCode;
  message: string;
}

export type ModelSessionResponse =
  | ModelSessionReadResponse
  | ModelSessionWriteResponse
  | ModelSessionErrorResponse;

export function buildModelSessionRoute(
  route: ModelSessionApiRoute,
  params: { sessionId?: string } = {},
): string {
  return route.replace(":sessionId", params.sessionId ?? ":sessionId");
}
