package api

import (
	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
)

func issueLoginResponse(ctx *gin.Context, mongoDB *db.MongoDB, user *models.User, rememberMe bool) (models.LoginResponse, error) {
	sessionPair, err := issueSessionPair(ctx, mongoDB, user, rememberMe)
	if err != nil {
		return models.LoginResponse{}, err
	}

	if err := SetAuthCookies(ctx, sessionPair.accessToken, sessionPair.accessExpiresAt, sessionPair.refreshToken, sessionPair.refreshExpiresAt, sessionPair.rememberMe); err != nil {
		return models.LoginResponse{}, err
	}

	return models.LoginResponse{
		User: models.ToUserView(*user),
	}, nil
}
