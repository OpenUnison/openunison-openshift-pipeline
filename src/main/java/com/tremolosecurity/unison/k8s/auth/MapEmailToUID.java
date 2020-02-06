package com.tremolosecurity.unison.k8s.auth;

import java.io.IOException;
import java.util.HashMap;

import javax.servlet.ServletContext;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

import com.tremolosecurity.config.util.UrlHolder;
import com.tremolosecurity.proxy.auth.AuthMechanism;
import com.tremolosecurity.proxy.auth.AuthController;
import com.tremolosecurity.proxy.auth.RequestHolder;
import com.tremolosecurity.proxy.auth.util.AuthStep;
import com.tremolosecurity.proxy.util.ProxyConstants;
import com.tremolosecurity.saml.Attribute;

/**
 * MapEmailToUID
 */
public class MapEmailToUID implements AuthMechanism {

    @Override
    public void doDelete(HttpServletRequest request, HttpServletResponse response, AuthStep step)
            throws IOException, ServletException {
                this.doGet(request, response, step);
    }

    @Override
    public void doGet(HttpServletRequest request, HttpServletResponse response, AuthStep step) throws IOException, ServletException {
        HttpSession session = ((HttpServletRequest) request).getSession(); 
        UrlHolder holder = (UrlHolder) request.getAttribute(ProxyConstants.AUTOIDM_CFG);
        if (holder == null) {
            throw new ServletException("Holder is null");
        }
        
        RequestHolder reqHolder = ((AuthController) session.getAttribute(ProxyConstants.AUTH_CTL)).getHolder();
        
        HashMap<String,Attribute> authParams = (HashMap<String,Attribute>) session.getAttribute(ProxyConstants.AUTH_MECH_PARAMS);

        AuthController ac = ((AuthController) request.getSession().getAttribute(ProxyConstants.AUTH_CTL));
        Attribute attr = ac.getAuthInfo().getAttribs().get("uid");
        
        String emailAddress = attr.getValues().get(0);
        String uid = emailAddress.replaceAll("[.@_]","-");
        attr.getValues().clear();
        attr.getValues().add(uid);

        step.setSuccess(true);
		holder.getConfig().getAuthManager().nextAuth(request, response,session,false);
    }

    @Override
    public void doHead(HttpServletRequest request, HttpServletResponse response, AuthStep step)
            throws IOException, ServletException {
                this.doGet(request, response, step);
    }

    @Override
    public void doOptions(HttpServletRequest request, HttpServletResponse response, AuthStep step)
            throws IOException, ServletException {
                this.doGet(request, response, step);
    }

    @Override
    public void doPost(HttpServletRequest request, HttpServletResponse response, AuthStep step)
            throws IOException, ServletException {
                this.doGet(request, response, step);
    }

    @Override
    public void doPut(HttpServletRequest request, HttpServletResponse response, AuthStep step)
            throws IOException, ServletException {
                this.doGet(request, response, step);
    }

	@Override
	public String getFinalURL(HttpServletRequest request, HttpServletResponse response) {
		return null;
	}

	@Override
	public void init(ServletContext ctx, HashMap<String, Attribute> config) {
		
	}

    
}