import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  actorKey,
  ddb,
  isMovieItem,
  isRoleItem,
  movieKey,
  parseId,
  tableName,
  toRole,
} from "../shared/db";
import { response } from "../shared/http";
import { logRequest } from "../shared/request-logger";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  logRequest(event);

  const movieId = parseId(event.pathParameters?.movieID);
  if (movieId === undefined) {
    return response(400, { message: "movieID must be a positive integer" });
  }
  // Optional ?actor= filter - must be a positive integer if given.
  const actorParam = event.queryStringParameters?.actor;
  const actorId = parseId(actorParam);
  if (actorParam !== undefined && actorId === undefined) {
    return response(400, { message: "actor must be a positive integer" });
  }
  try {
    // With ?actor: get the one role item (PK = movie, SK = actor).
    if (actorId !== undefined) {
      const getResult = await ddb.send(
        new GetCommand({
          TableName: tableName,
          Key: { PK: movieKey(movieId), SK: actorKey(actorId), }
        })
      );
      if (!getResult.Item) {
        return response(404, { message: `Actor ${actorId} Role not in the movie ${movieId}` });
      }
      return response(200, { data: [toRole(getResult.Item)] });
    }
    // Without ?actor: query every item in the movie's partition.
    const queryResult = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": movieKey(movieId) },
      })
    );

    // No movie item in the partition means the movie doesn't exist -> 404.
    const resultItems = queryResult.Items ?? [];
    if (!resultItems.some(isMovieItem)) {
      return response(404, { message: `Movie ${movieId} not found` });
    }

    // Return only the role items, not the movie item itself.
    return response(200, { data: resultItems.filter(isRoleItem).map(toRole) });
  } catch (err) {
    // Log the real error, but don't expose it to the client.
    console.error("DynamoDB error:", err);
    return response(500, { message: "Internal server error" });

  }
};
