import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { actorKey, ddb, movieKey, type Role, tableName } from "../shared/db";
import { isResponse, parseJsonObject, response } from "../shared/http";
import { logRequest } from "../shared/request-logger";

const isPositiveInteger = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) > 0;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
    logRequest(event);

  const body = parseJsonObject(event);
  if (isResponse(body)) return body;

    const { movieId, actorId, roleName, roleDescription } = body;
  const invalid = [
    !isPositiveInteger(movieId) && "movieId",
    !isPositiveInteger(actorId) && "actorId",
    !isNonEmptyString(roleName) && "roleName",
    !isNonEmptyString(roleDescription) && "roleDescription",
  ].filter(Boolean);
  if (invalid.length) {
    return response(400, { message: `Missing or invalid fields: ${invalid.join(", ")}` });
  }

  const role: Role = {
    movieId: movieId as number,
    actorId: actorId as number,
    roleName: roleName as string,
    roleDescription: roleDescription as string,
  };


  try {
    //  TOD∏O - Add role if its IDs are valid
    return response(201, { message: "Role added", data: role });
  } catch (err) {
    console.error("DynamoDB error:", err);
    return response(500, {
      message: "Internal server error",
      error: err,
    });
  }
};
