package api

import (
	"errors"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/db"
)

var errNoRequestAuth = errors.New("request is not authenticated")

func IsNoRequestAuth(err error) bool {
	return errors.Is(err, errNoRequestAuth)
}

// OptionalRequestAuth extracts the current user from the opaque session cookie
// when present. It does not mutate the Gin context and returns
// errNoRequestAuth when the request is anonymous.
func OptionalRequestAuth(ctx *gin.Context, mongoDB *db.MongoDB) (string, []string, error) {
	tokenString := readAccessTokenFromRequest(ctx.Request)
	if tokenString == "" {
		return "", nil, errNoRequestAuth
	}

	session, err := findOpaqueSession(ctx.Request.Context(), mongoDB, tokenString, sessionKindAccess)
	if err != nil {
		if errors.Is(err, errSessionNotFound) {
			return "", nil, errNoRequestAuth
		}

		return "", nil, err
	}

	user, err := mongoDB.GetUserByUsername(session.Username)
	if err != nil {
		return "", nil, err
	}
	if user == nil || !user.Enabled {
		_ = deleteAllOpaqueSessionsForUser(ctx.Request.Context(), mongoDB, session.Username)
		return "", nil, errNoRequestAuth
	}

	return user.Username, user.Roles, nil
}
