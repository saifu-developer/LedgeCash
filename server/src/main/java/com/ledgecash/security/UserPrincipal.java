package com.ledgecash.security;

import com.ledgecash.model.User;
import com.ledgecash.model.UserRole;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.Collections;

public class UserPrincipal implements UserDetails {

    private final String id;
    private final String phone;
    private final String name;
    private final String shopId;
    private final UserRole role;
    private final String password;
    private final Collection<? extends GrantedAuthority> authorities;

    public UserPrincipal(String id, String phone, String name, String shopId, UserRole role, String password) {
        this.id = id;
        this.phone = phone;
        this.name = name;
        this.shopId = shopId;
        this.role = role;
        this.password = password;
        this.authorities = Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role.name()));
    }

    public static UserPrincipal create(User user) {
        return new UserPrincipal(
                user.getId(),
                user.getPhone(),
                user.getName(),
                user.getShopId(),
                user.getRole(),
                user.getPinHash()
        );
    }

    public String getId() {
        return id;
    }

    public String getPhone() {
        return phone;
    }

    public String getName() {
        return name;
    }

    public String getShopId() {
        return shopId;
    }

    public UserRole getRole() {
        return role;
    }

    public boolean isOwner() {
        return this.role == UserRole.OWNER;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return authorities;
    }

    @Override
    public String getPassword() {
        return password;
    }

    @Override
    public String getUsername() {
        return phone;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }
}
