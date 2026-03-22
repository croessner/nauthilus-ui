package api

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
)

func buildTokenClaims(user *models.User, expiresAt int64) jwt.MapClaims {
	return jwt.MapClaims{
		"sub":   user.Username,
		"roles": user.Roles,
		"exp":   expiresAt,
		"iat":   time.Now().Unix(),
	}
}

func issueLoginResponse(ctx *gin.Context, mongoDB *db.MongoDB, user *models.User, rememberMe bool) (models.LoginResponse, error) {
	jwtConfig, err := mongoDB.GetJWTConfig()
	if err != nil {
		return models.LoginResponse{}, err
	}

	accessExpirySeconds := jwtConfig.TokenExpiry
	if rememberMe && jwtConfig.RememberMeExpiry > 0 {
		accessExpirySeconds = jwtConfig.RememberMeExpiry
	}

	accessExpiresAt := time.Now().Add(time.Duration(accessExpirySeconds) * time.Second).Unix()
	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, buildTokenClaims(user, accessExpiresAt))
	accessTokenString, err := accessToken.SignedString([]byte(jwtConfig.Secret))
	if err != nil {
		return models.LoginResponse{}, err
	}

	refreshExpiresAt := time.Now().Add(time.Duration(jwtConfig.RefreshTokenExpiry) * time.Second).Unix()
	refreshToken := jwt.NewWithClaims(jwt.SigningMethodHS256, buildTokenClaims(user, refreshExpiresAt))
	refreshTokenString, err := refreshToken.SignedString([]byte(jwtConfig.Secret))
	if err != nil {
		return models.LoginResponse{}, err
	}

	if err := SetAuthCookies(ctx, accessTokenString, accessExpiresAt, refreshTokenString, refreshExpiresAt); err != nil {
		return models.LoginResponse{}, err
	}

	return models.LoginResponse{
		User:         models.ToUserView(*user),
		Token:        accessTokenString,
		RefreshToken: refreshTokenString,
		ExpiresAt:    accessExpiresAt,
	}, nil
}
