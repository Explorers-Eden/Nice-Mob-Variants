execute store result score $trap_type nice_mob_variants.technical run random value 1..4

execute if score $trap_type nice_mob_variants.technical matches 1 run data modify storage eden:temp trap.type set value "cat"
execute if score $trap_type nice_mob_variants.technical matches 2 run data modify storage eden:temp trap.type set value "wolf"
execute if score $trap_type nice_mob_variants.technical matches 3 run data modify storage eden:temp trap.type set value "chicken"
execute if score $trap_type nice_mob_variants.technical matches 4 run data modify storage eden:temp trap.type set value "cow"

data modify storage eden:temp trap.scale set value 0.5d
execute if score $trap_type nice_mob_variants.technical matches 2 run data modify storage eden:temp trap.scale set value 0.7d
execute if score $trap_type nice_mob_variants.technical matches 4 run data modify storage eden:temp trap.scale set value 0.8d