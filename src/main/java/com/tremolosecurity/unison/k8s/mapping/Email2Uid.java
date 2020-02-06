package com.tremolosecurity.unison.k8s.mapping;

import com.tremolosecurity.provisioning.core.User;
import com.tremolosecurity.provisioning.mapping.CustomMapping;
import com.tremolosecurity.saml.Attribute;

/**
 * Email2Uid
 */
public class Email2Uid implements CustomMapping {

    @Override
    public Attribute doMapping(User user, String source) {
        Attribute mail = user.getAttribs().get("mail");
        String emailAddress = mail.getValues().get(0);
        String uid = emailAddress.replaceAll("[.@_+]","-");
        Attribute uidAttr = new Attribute("uid",uid);
        return uidAttr;
	}

    
}