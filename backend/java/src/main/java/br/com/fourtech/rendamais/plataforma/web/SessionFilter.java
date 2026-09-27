package br.com.fourtech.rendamais.plataforma.web;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.application.SessionService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

/**
 * Exige sessão válida em toda a API (ADR-005), exceto o estado do servidor e o próprio login.
 * O token chega em {@code Authorization: Bearer ...}; o usuário fica disponível em {@link CurrentUserHolder}.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
class SessionFilter extends OncePerRequestFilter {

    private final SessionService sessions;
    private final JsonMapper json;

    SessionFilter(SessionService sessions, JsonMapper json) {
        this.sessions = sessions;
        this.json = json;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        if (!path.startsWith("/api/")) {
            return true;
        }
        return path.equals("/api/v1/status") || (path.equals("/api/v1/session") && "POST".equals(request.getMethod()));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Optional<CurrentUser> user = sessions.authenticate(bearer(request));
        if (user.isEmpty()) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            response.getWriter().write(json.writeValueAsString(new ApiError("UNAUTHENTICATED",
                    "Sessão expirada ou inexistente. Entre novamente.", List.of(), CorrelationId.current(), false)));
            return;
        }
        CurrentUserHolder.set(user.get());
        try {
            chain.doFilter(request, response);
        } finally {
            CurrentUserHolder.clear();
        }
    }

    static String bearer(HttpServletRequest request) {
        String h = request.getHeader("Authorization");
        return h != null && h.startsWith("Bearer ") ? h.substring(7).strip() : null;
    }
}
