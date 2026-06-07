package apperror

import (
	"fmt"
	"net/http"
)

// AppError is the unified error type for all HTTP error responses.
// All handlers return AppError; middleware converts it to a JSON response.
type AppError struct {
	Code    int    `json:"-"`
	ErrCode string `json:"code"`
	Message string `json:"message"`
}

func (e *AppError) Error() string {
	return fmt.Sprintf("[%s] %s", e.ErrCode, e.Message)
}

// Predefined error constructors.
func BadRequest(msg string) *AppError {
	return &AppError{Code: http.StatusBadRequest, ErrCode: "BAD_REQUEST", Message: msg}
}

func Unauthorized(msg string) *AppError {
	return &AppError{Code: http.StatusUnauthorized, ErrCode: "UNAUTHORIZED", Message: msg}
}

func Forbidden(msg string) *AppError {
	return &AppError{Code: http.StatusForbidden, ErrCode: "FORBIDDEN", Message: msg}
}

func NotFound(msg string) *AppError {
	return &AppError{Code: http.StatusNotFound, ErrCode: "NOT_FOUND", Message: msg}
}

func Conflict(msg string) *AppError {
	return &AppError{Code: http.StatusConflict, ErrCode: "CONFLICT", Message: msg}
}

func Internal(msg string) *AppError {
	return &AppError{Code: http.StatusInternalServerError, ErrCode: "INTERNAL", Message: msg}
}
