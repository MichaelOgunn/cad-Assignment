import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import type { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
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
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: tableName,
              Key: { PK: movieKey(role.movieId), SK: movieKey(role.movieId) },
              ConditionExpression: "attribute_exists(PK)",
            },
          },
          {
            ConditionCheck: {
              TableName: tableName,
              Key: { PK: actorKey(role.actorId), SK: actorKey(role.actorId) },
              ConditionExpression: "attribute_exists(PK)",
            },
          },
          {
            Put: {
              TableName: tableName,
              Item: { PK: movieKey(role.movieId), SK: actorKey(role.actorId), ...role },
              ConditionExpression: "attribute_not_exists(PK)",
            },
          },
        ],
      })
    );
    return response(201, { message: "Role added", data: role });
  } catch (err) {
    if ((err as Error).name === "TransactionCanceledException") {
      const [movieCheck, actorCheck, rolePut] =
        (err as TransactionCanceledException).CancellationReasons ?? [];
      if (movieCheck?.Code === "ConditionalCheckFailed") {
        return response(404, { message: `Movie ${role.movieId} not found` });
      }
      if (actorCheck?.Code === "ConditionalCheckFailed") {
        return response(404, { message: `Actor ${role.actorId} not found` });
      }
      if (rolePut?.Code === "ConditionalCheckFailed") {
        return response(409, {
          message: `Actor ${role.actorId} already has a role in movie ${role.movieId}`,
        });
      }
    }
    console.error("DynamoDB error:", err);
    return response(500, { message: "Internal server error" });
  }


 
};
