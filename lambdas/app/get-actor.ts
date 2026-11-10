import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  actorKey,
  ddb,
  movieKey,
  parseId,
  tableName,
  toActor,
} from "../shared/db";
import { response } from "../shared/http";
import { logRequest } from "../shared/request-logger";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  logRequest(event);

  const actorId = parseId(event.pathParameters?.actorID);
  if (actorId === undefined) {
    return response(400, { message: "actorID must be a positive integer" });
  }

  // Optional ?movie= filter - must be a positive integer if given.
  const movieParam = event.queryStringParameters?.movie;
  const movieId = parseId(movieParam);
  if (movieParam !== undefined && movieId === undefined) {
    return response(400, { message: "movie must be a positive integer" });
  }
  try {
    const actorResult = await ddb.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: actorKey(actorId), SK: actorKey(actorId) },
      })
    );

    if (!actorResult.Item) {
      return response(404, { message: `Actor ${actorId} not found` });
    }
    const actor = toActor(actorResult.Item);
    // No movie filter: just return the actor's profile.
    if (movieId === undefined) {
      return response(200, { data: actor });
    }

    // With ?movie: get the role item and add its description to the actor.
    const roleResult = await ddb.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: movieKey(movieId), SK: actorKey(actorId) },
      })
    );
    return response(200, {
      data: { ...actor, roleDescription: roleResult.Item?.roleDescription },
    });

  } catch (err) {
    // Log the real error, but don't expose it to the client.
    console.error("DynamoDB error:", err);
    return response(500, { message: "Internal server error" });
  }
};
