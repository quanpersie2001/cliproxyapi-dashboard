import { verifySession } from "@/lib/auth/session";
import { Errors, apiSuccess } from "@/lib/errors";
import { listModelPricing } from "@/lib/model-pricing";

export async function GET() {
  const session = await verifySession();
  if (!session) {
    return Errors.unauthorized();
  }

  try {
    const modelPricing = await listModelPricing();
    return apiSuccess({ modelPricing });
  } catch (error) {
    return Errors.internal("GET /api/model-pricing", error);
  }
}
